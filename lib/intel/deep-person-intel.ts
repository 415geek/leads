/**
 * 全网深度人员情报（v2）
 *
 * 设计变更（vs v1）：
 * - 不再让 Tavily 自由选择域名（会偏 LinkedIn / 公司官网）
 * - 使用 Tavily `include_domains` **强制定向**到 people-search 站点
 *   （whitepages / 411 / clustrmaps / truepeoplesearch / fastpeoplesearch /
 *    spokeo / radaris / beenverified / mylife / peoplefinders / 等）
 * - 同时跑一组「商务定向」查询（公司官网 + 行业目录）拿邮箱与网站
 * - Claude 在 prompt 中被告知两类源的可信度差异：
 *     people-search 域 → 个人电话 / 地址 / 年龄 / 亲属
 *     商务域 → 公司邮箱 / 网站 / 职位
 * - 反幻觉护栏不变：source_url 必须在证据集中，否则前端不展示
 */

import Anthropic from '@anthropic-ai/sdk';

const CLASSIFY_MODEL =
  process.env.ANTHROPIC_CLASSIFY_MODEL || 'claude-haiku-4-5-20251001';

export interface TavilySnippetWithBucket {
  title: string;
  url: string;
  content: string;
  /** 来源类别，用于 prompt 与前端区分 */
  bucket: 'people_search' | 'business';
}

/** 公开 people-search 类网站（Tavily include_domains 白名单） */
export const PEOPLE_SEARCH_DOMAINS = [
  'whitepages.com',
  '411.com',
  'clustrmaps.com',
  'truepeoplesearch.com',
  'fastpeoplesearch.com',
  'spokeo.com',
  'radaris.com',
  'beenverified.com',
  'mylife.com',
  'peoplefinders.com',
  'peoplelooker.com',
  'ussearch.com',
  'instantcheckmate.com',
  'thatsthem.com',
  'neighbor.report',
] as const;

/** 商务/职业类网站（用于补充公司邮箱、官网、媒体报道） */
export const BUSINESS_SEARCH_DOMAINS = [
  'linkedin.com',
  'crunchbase.com',
  'bloomberg.com',
  'zoominfo.com',
  'rocketreach.co',
  'apollo.io',
  'signalhire.com',
] as const;

export interface DeepIntelSeed {
  full_name: string;
  job_title?: string | null;
  job_company_name?: string | null;
  location_name?: string | null;
  linkedin_url?: string | null;
  work_email?: string | null;
}

export interface DeepIntelContact {
  value: string;
  source_url: string;
  confidence: number;
  note?: string;
}

export interface DeepIntelEvidence {
  title: string;
  url: string;
  bucket: 'people_search' | 'business';
}

export interface DeepPersonIntelResult {
  updated_at: string;
  model: string;
  match_confidence: number;
  emails: DeepIntelContact[];
  phones: DeepIntelContact[];
  addresses: DeepIntelContact[];
  websites: DeepIntelContact[];
  socials: DeepIntelContact[];
  /** 公开记录里收集到的可能的亲属 / 同住人姓名（可能为空） */
  possible_relatives: DeepIntelContact[];
  /** 年龄段，如 "40-44" — 仅来自 people-search 站点 */
  age_range: DeepIntelContact[];
  summary_zh: string;
  rationale_zh: string;
  search_snippets_used: number;
  people_search_hits: number;
  business_hits: number;
  evidence: DeepIntelEvidence[];
}

const MAX_RESULTS_PER_QUERY = 6;
const MAX_TOTAL_SNIPPETS = 28;

function quotedIfHasSpace(v: string): string {
  return /\s/.test(v) ? `"${v}"` : v;
}

/**
 * 构造**两批**查询：
 * - peopleQueries：定向 people-search 站点，搜个人电话 / 地址 / 亲属
 * - businessQueries：定向商务/职业站点，搜公司邮箱 / 网站
 */
export function buildDeepSearchQueries(seed: DeepIntelSeed): {
  peopleQueries: string[];
  businessQueries: string[];
} {
  const name = quotedIfHasSpace(seed.full_name.trim());
  const cityPart = seed.location_name?.trim()
    ? quotedIfHasSpace(seed.location_name.split(',')[0]!.trim())
    : '';
  const fullLocation = seed.location_name?.trim()
    ? quotedIfHasSpace(seed.location_name.trim())
    : '';
  const company = seed.job_company_name?.trim()
    ? quotedIfHasSpace(seed.job_company_name.trim())
    : '';

  const peopleQueries = [
    cityPart ? `${name} ${cityPart}` : name,
    cityPart ? `${name} ${cityPart} phone` : `${name} phone`,
    cityPart ? `${name} ${cityPart} address` : `${name} address`,
    fullLocation && fullLocation !== cityPart
      ? `${name} ${fullLocation} relatives`
      : `${name} age relatives`,
  ];

  const businessQueries = [
    company ? `${name} ${company}` : name,
    company ? `${name} ${company} email` : `${name} email`,
  ];

  const dedup = (arr: string[]) => {
    const seen = new Set<string>();
    return arr
      .map((q) => q.replace(/\s+/g, ' ').trim())
      .filter((q) => {
        if (!q) return false;
        if (seen.has(q)) return false;
        seen.add(q);
        return true;
      });
  };

  return {
    peopleQueries: dedup(peopleQueries),
    businessQueries: dedup(businessQueries),
  };
}

/** 直接调用 Tavily 并强制 include_domains。失败返回空数组（不抛） */
export async function tavilySearchInDomains(
  query: string,
  includeDomains: readonly string[],
  maxResults = MAX_RESULTS_PER_QUERY,
): Promise<Array<{ title: string; url: string; content: string }>> {
  const key = process.env.TAVILY_API_KEY?.trim();
  if (!key) return [];

  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: key,
      query,
      search_depth: 'advanced',
      max_results: maxResults,
      include_answer: false,
      include_domains: [...includeDomains],
    }),
  });
  if (!res.ok) return [];

  const data = (await res.json()) as {
    results?: Array<{ title?: string; url?: string; content?: string }>;
  };
  return (data.results ?? []).map((r) => ({
    title: String(r.title ?? ''),
    url: String(r.url ?? ''),
    content: String(r.content ?? '').slice(0, 900),
  }));
}

export async function runTavilyTwoBucketSearch(queries: {
  peopleQueries: string[];
  businessQueries: string[];
}): Promise<TavilySnippetWithBucket[]> {
  const peoplePromises = queries.peopleQueries.map((q) =>
    tavilySearchInDomains(q, PEOPLE_SEARCH_DOMAINS).catch(() => []),
  );
  const businessPromises = queries.businessQueries.map((q) =>
    tavilySearchInDomains(q, BUSINESS_SEARCH_DOMAINS).catch(() => []),
  );

  const [peopleBatches, businessBatches] = await Promise.all([
    Promise.all(peoplePromises),
    Promise.all(businessPromises),
  ]);

  const seen = new Set<string>();
  const merged: TavilySnippetWithBucket[] = [];

  const push = (
    rows: Array<{ title: string; url: string; content: string }>,
    bucket: 'people_search' | 'business',
  ) => {
    for (const r of rows) {
      if (!r.url || seen.has(r.url)) continue;
      seen.add(r.url);
      merged.push({ ...r, bucket });
      if (merged.length >= MAX_TOTAL_SNIPPETS) return true;
    }
    return false;
  };

  // 优先 people_search bucket
  for (const batch of peopleBatches) if (push(batch, 'people_search')) return merged;
  for (const batch of businessBatches) if (push(batch, 'business')) return merged;

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
    if (!snippetUrls.has(source)) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const note =
      typeof item.note === 'string' ? item.note.trim().slice(0, 160) : undefined;
    out.push({
      value: value.slice(0, 220),
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

function snippetsBlock(snippets: TavilySnippetWithBucket[]): string {
  if (snippets.length === 0) {
    return '（无任何搜索结果。所有联系方式数组留空。）';
  }
  const people = snippets.filter((s) => s.bucket === 'people_search');
  const business = snippets.filter((s) => s.bucket === 'business');

  const render = (
    title: string,
    rows: TavilySnippetWithBucket[],
    startIdx: number,
  ) =>
    rows.length === 0
      ? `### ${title}\n（无结果）`
      : `### ${title}\n` +
        rows
          .map(
            (s, i) =>
              `[${startIdx + i + 1}] ${s.title}\nURL: ${s.url}\n${s.content}`,
          )
          .join('\n\n');

  return [
    render('People-search 域（个人电话/地址/亲属来源）', people, 0),
    render('商务/职业域（公司邮箱/网站来源）', business, people.length),
  ].join('\n\n');
}

const SYSTEM_PROMPT = `你是 B2B 销售情报分析助手，专长是综合「人物画像数据库」（People-search 站点）+「商业职业数据库」两类公开网页摘要，输出可联系信息。

【源的可信度规则】
- People-search 域（whitepages / 411 / clustrmaps / truepeoplesearch / fastpeoplesearch / spokeo / radaris / mylife 等）：
  - 主要数据：电话、住址（城市/州层面）、年龄段、可能的亲属/同住人姓名
  - 限制：电话和具体街道往往在 paywall 后面，常常只能看到「Last seen near city, state」+「Age 4X」+「Possible relatives: A, B」
  - 不要把这些站点上零星出现的「Email」字段当作权威；这些站点的 email 大多为聚合脏数据
- 商务/职业域（linkedin / crunchbase / bloomberg / zoominfo 等）：
  - 主要数据：公司、职位、公司邮箱、个人网站、社交档案
  - 不可作为「个人电话」或「家庭住址」的来源

【严格输出格式】
1. 只输出一个 JSON 对象，禁止 markdown，禁止其它文字。
2. 字段：
   - match_confidence (0-100 整数)
   - emails[], phones[], addresses[], websites[], socials[], possible_relatives[], age_range[]
   - summary_zh (≤140字), rationale_zh (≤200字)
3. 每个数组元素：{value, source_url, confidence (0-100), note?}
4. source_url **必须**等于 prompt 摘要里 URL: xxx 后面那个原始 URL；如果你想引用的源不在列表里，**不要**输出该条。
5. 同名歧义检测：若多个候选人撞名，只保留与种子姓名 + (公司或地区) 同时匹配最强的；其余在 rationale_zh 标记「歧义」。
6. 若摘要文本里只看到「Last known near X」「Age 40-44」「Possible relatives: A, B」等含糊信息，仍可输出地址（城市级）/ age_range / relatives，但 confidence 不要超过 60。
7. 电话号码：
   - 摘要中出现的**完整**号码 (xxx) xxx-xxxx：confidence 80-95
   - 摘要中出现的**掩码**号码 (xxx) xxx-****、xxx-xxx-****、(xxx) ***-xxxx：可以输出，value 保留原文掩码字符，confidence 30-55，note 字段必须以「部分掩码 — 」开头说明哪些位被隐藏；这种号码常见于 whitepages / spokeo / radaris 的 free tier 摘要，对销售有定位价值（区号识别地区）。
   - 不要把电话格式以外的随机数字串当电话；不要"补全"掩码位。
8. summary_zh：第一句话明确说出「✅ 已确认 / ⚠️ 部分确认 / ❌ 未确认是同一人」+ 主要发现。`;

function buildUserPrompt(
  seed: DeepIntelSeed,
  snippets: TavilySnippetWithBucket[],
): string {
  return `【PDL 结构化种子字段】
${seedContextBlock(seed)}

【公开网页摘要（共 ${snippets.length} 条）】
${snippetsBlock(snippets)}`;
}

export interface RunDeepPersonIntelOptions {
  searchOverride?: (queries: {
    peopleQueries: string[];
    businessQueries: string[];
  }) => Promise<TavilySnippetWithBucket[]>;
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
    : await runTavilyTwoBucketSearch(queries);

  const snippetUrls = new Set(snippets.map((s) => s.url).filter(Boolean));

  const client =
    options.anthropic ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const message = await client.messages.create({
    model: CLASSIFY_MODEL,
    max_tokens: 1800,
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

  const noSnippets = snippets.length === 0;
  const matchConfidence = noSnippets
    ? Math.min(clampPct(parsed.match_confidence), 20)
    : clampPct(parsed.match_confidence);

  const peopleHits = snippets.filter((s) => s.bucket === 'people_search').length;
  const businessHits = snippets.filter((s) => s.bucket === 'business').length;

  return {
    updated_at: new Date().toISOString(),
    model: CLASSIFY_MODEL,
    match_confidence: matchConfidence,
    emails: noSnippets ? [] : normalizeContacts(parsed.emails, snippetUrls),
    phones: noSnippets ? [] : normalizeContacts(parsed.phones, snippetUrls),
    addresses: noSnippets ? [] : normalizeContacts(parsed.addresses, snippetUrls),
    websites: noSnippets ? [] : normalizeContacts(parsed.websites, snippetUrls),
    socials: noSnippets ? [] : normalizeContacts(parsed.socials, snippetUrls),
    possible_relatives: noSnippets
      ? []
      : normalizeContacts(parsed.possible_relatives, snippetUrls),
    age_range: noSnippets ? [] : normalizeContacts(parsed.age_range, snippetUrls),
    summary_zh: String(parsed.summary_zh ?? '').slice(0, 280),
    rationale_zh: String(parsed.rationale_zh ?? '').slice(0, 400),
    search_snippets_used: snippets.length,
    people_search_hits: peopleHits,
    business_hits: businessHits,
    evidence: snippets.map((s) => ({
      title: s.title,
      url: s.url,
      bucket: s.bucket,
    })),
  };
}
