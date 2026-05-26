/**
 * 全网深度人员情报：以 PDL 结构化字段为种子，调用 Tavily 多组联网搜索，
 * 再用 Claude Haiku 做交叉验证，输出结构化联系方式（邮箱/电话/地址/社交/网站）。
 *
 * 关键设计：
 * - 不调用 PDL Person Enrichment（成本控制），仅以 person/search 结果为种子；
 * - 每条联系方式都必须带 source_url 与 confidence；AI 编造无源字段会被前端过滤；
 * - match_confidence 衡量「Tavily 命中是否确实指向同一个人」（低于阈值时只展示摘要）。
 */

import Anthropic from '@anthropic-ai/sdk';
import { tavilySearchSnippets, type TavilySnippet } from '@/lib/opening-intel-web';

const CLASSIFY_MODEL =
  process.env.ANTHROPIC_CLASSIFY_MODEL || 'claude-haiku-4-5-20251001';

export interface DeepIntelSeed {
  full_name: string;
  job_title?: string | null;
  job_company_name?: string | null;
  location_name?: string | null;
  linkedin_url?: string | null;
  work_email?: string | null;
}

export interface DeepIntelContact {
  /** 标准化后的联系字段值（邮箱/电话/地址/URL） */
  value: string;
  /** 来源 URL（Tavily 摘要或 LinkedIn 等）；缺失视为 AI 编造，前端必须过滤 */
  source_url: string;
  /** 0-100：该字段属于本人的置信度 */
  confidence: number;
  /** 简短说明 */
  note?: string;
}

export interface DeepIntelEvidence {
  title: string;
  url: string;
}

export interface DeepPersonIntelResult {
  updated_at: string;
  model: string;
  /** 0-100：综合所有线索后，这个 Tavily 搜索结果集是否确认是同一个人 */
  match_confidence: number;
  emails: DeepIntelContact[];
  phones: DeepIntelContact[];
  addresses: DeepIntelContact[];
  websites: DeepIntelContact[];
  socials: DeepIntelContact[];
  summary_zh: string;
  rationale_zh: string;
  search_snippets_used: number;
  evidence: DeepIntelEvidence[];
}

const MAX_SNIPPETS_PER_QUERY = 5;
const MAX_TOTAL_SNIPPETS = 16;

function quotedIfHasSpace(v: string): string {
  return /\s/.test(v) ? `"${v}"` : v;
}

/** 构造 Tavily 多组查询：身份确认 / 联系方式 / 社交 / 电话地址 */
export function buildDeepSearchQueries(seed: DeepIntelSeed): string[] {
  const name = quotedIfHasSpace(seed.full_name.trim());
  const company = seed.job_company_name?.trim()
    ? quotedIfHasSpace(seed.job_company_name.trim())
    : '';
  const location = seed.location_name?.trim()
    ? quotedIfHasSpace(seed.location_name.split(',')[0]!.trim())
    : '';

  const queries: string[] = [];
  if (company) queries.push(`${name} ${company}`);
  queries.push(`${name} ${company} email OR contact`.trim());
  queries.push(`${name} ${location || company} linkedin OR profile`.trim());
  queries.push(`${name} ${company} phone OR address OR "based in"`.trim());

  // 去重 + 清理多空格
  const seen = new Set<string>();
  return queries
    .map((q) => q.replace(/\s+/g, ' ').trim())
    .filter((q) => {
      if (!q) return false;
      if (seen.has(q)) return false;
      seen.add(q);
      return true;
    });
}

export async function runTavilyMultiSearch(
  queries: string[],
): Promise<TavilySnippet[]> {
  const results = await Promise.all(
    queries.map((q) => tavilySearchSnippets(q).catch(() => [] as TavilySnippet[])),
  );

  // 按 URL 去重，再总量截断
  const seen = new Set<string>();
  const merged: TavilySnippet[] = [];
  for (const snippets of results) {
    for (const s of snippets.slice(0, MAX_SNIPPETS_PER_QUERY)) {
      if (!s.url || seen.has(s.url)) continue;
      seen.add(s.url);
      merged.push(s);
      if (merged.length >= MAX_TOTAL_SNIPPETS) return merged;
    }
  }
  return merged;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

function clampPct(n: unknown): number {
  if (typeof n !== 'number' || Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function parseModelJson(text: string): Record<string, unknown> | null {
  const t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1].trim() : t;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end < 0 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function normalizeContacts(
  raw: unknown,
  snippetUrls: Set<string>,
): DeepIntelContact[] {
  if (!Array.isArray(raw)) return [];
  const out: DeepIntelContact[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const value = typeof item.value === 'string' ? item.value.trim() : '';
    const source = typeof item.source_url === 'string' ? item.source_url.trim() : '';
    if (!value || !source) continue;
    // 必须来自 Tavily 给出的 URL 之一，否则视为 AI 编造
    if (!snippetUrls.has(source)) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const note =
      typeof item.note === 'string' ? item.note.trim().slice(0, 160) : undefined;
    out.push({
      value: value.slice(0, 200),
      source_url: source,
      confidence: clampPct(item.confidence),
      note,
    });
  }
  return out;
}

function seedContextBlock(seed: DeepIntelSeed): string {
  return [
    `姓名: ${seed.full_name}`,
    `职位: ${seed.job_title ?? '—'}`,
    `公司: ${seed.job_company_name ?? '—'}`,
    `地区: ${seed.location_name ?? '—'}`,
    `LinkedIn: ${seed.linkedin_url ?? '—'}`,
    `已知邮箱: ${seed.work_email ?? '—'}`,
  ].join('\n');
}

function snippetsBlock(snippets: TavilySnippet[]): string {
  if (snippets.length === 0) {
    return '（未配置 TAVILY_API_KEY 或搜索无结果。仅根据上方结构化字段输出，所有联系方式数组留空。）';
  }
  return snippets
    .map((s, i) => `[${i + 1}] ${s.title}\nURL: ${s.url}\n${s.content}`)
    .join('\n\n');
}

const SYSTEM_PROMPT = `你是 B2B 销售情报分析助手。任务：根据「PDL 结构化种子字段」+「Tavily 联网搜索摘要」交叉验证目标人物的可联系方式。

严格规则：
1. 只输出一个 JSON 对象，禁止 markdown，禁止其它文字。
2. 字段：match_confidence (0-100 整数), emails[], phones[], addresses[], websites[], socials[], summary_zh (≤120字), rationale_zh (≤180字)。
3. emails/phones/addresses/websites/socials 每一项必须是 {value, source_url, confidence, note?} 形式；source_url **必须**是搜索摘要中给出的 URL 之一，否则不输出。
4. 如摘要里没有任何能确认是同一个人的证据（如同名同公司、相同地区、相同 LinkedIn 个人主页），把 match_confidence 设为 ≤30 且各数组全部留空。
5. 同名歧义：若多个候选人撞名，只保留与种子公司/地区匹配最强的；其余在 rationale_zh 中标记「歧义」。
6. 联系方式 confidence：source 是 LinkedIn / 公司官网 / 官方介绍 → 80-95；新闻媒体 → 60-80；论坛/聚合站 → 30-60。
7. 地址不要包含街道门牌精确到家庭住址；只输出城市/州/办公地址。
8. summary_zh 用一句话概括「确认/未确认 + 主要发现」；rationale_zh 列举判断依据（≤3 条）。`;

function buildUserPrompt(
  seed: DeepIntelSeed,
  snippets: TavilySnippet[],
): string {
  return `【PDL 结构化种子字段】
${seedContextBlock(seed)}

【Tavily 联网搜索摘要（共 ${snippets.length} 条）】
${snippetsBlock(snippets)}`;
}

export interface RunDeepPersonIntelOptions {
  /** 注入测试桩 */
  searchOverride?: (queries: string[]) => Promise<TavilySnippet[]>;
  anthropic?: Anthropic;
}

export async function runDeepPersonIntel(
  seed: DeepIntelSeed,
  options: RunDeepPersonIntelOptions = {},
): Promise<DeepPersonIntelResult> {
  if (!seed.full_name?.trim()) {
    throw new Error('EMPTY_NAME');
  }
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }

  const queries = buildDeepSearchQueries(seed);
  const snippets = options.searchOverride
    ? await options.searchOverride(queries)
    : await runTavilyMultiSearch(queries);

  const snippetUrls = new Set(snippets.map((s) => s.url).filter(Boolean));

  const client =
    options.anthropic ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const message = await client.messages.create({
    model: CLASSIFY_MODEL,
    max_tokens: 1200,
    messages: [{ role: 'user', content: buildUserPrompt(seed, snippets) }],
    system: SYSTEM_PROMPT,
  });

  const block = message.content[0];
  if (!block || block.type !== 'text') {
    throw new Error('Unexpected response format from Claude');
  }

  const parsed = parseModelJson(block.text);
  if (!parsed) {
    throw new Error('Failed to parse deep intel JSON from model');
  }

  // 若实际拿不到任何 Tavily snippet，强制 match_confidence ≤ 20 并清空联系方式
  const noSnippets = snippets.length === 0;
  const matchConfidence = noSnippets
    ? Math.min(clampPct(parsed.match_confidence), 20)
    : clampPct(parsed.match_confidence);

  return {
    updated_at: new Date().toISOString(),
    model: CLASSIFY_MODEL,
    match_confidence: matchConfidence,
    emails: noSnippets ? [] : normalizeContacts(parsed.emails, snippetUrls),
    phones: noSnippets ? [] : normalizeContacts(parsed.phones, snippetUrls),
    addresses: noSnippets ? [] : normalizeContacts(parsed.addresses, snippetUrls),
    websites: noSnippets ? [] : normalizeContacts(parsed.websites, snippetUrls),
    socials: noSnippets ? [] : normalizeContacts(parsed.socials, snippetUrls),
    summary_zh: String(parsed.summary_zh ?? '').slice(0, 240),
    rationale_zh: String(parsed.rationale_zh ?? '').slice(0, 360),
    search_snippets_used: snippets.length,
    evidence: snippets.map((s) => ({ title: s.title, url: s.url })),
  };
}
