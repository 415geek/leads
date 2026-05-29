/**
 * 老板信息：Whitepages 姓名候选 + 匹配关键字 + OpenCorporates/政府登记 + Tavily + Claude 深度交叉验证
 */

import Anthropic from '@anthropic-ai/sdk';
import { tavilySearchSnippets } from '@/lib/opening-intel-web';
import {
  runTavilyTwoBucketSearch,
  type TavilySnippetWithBucket,
} from '@/lib/intel/deep-person-intel';
import { formatOwnerRecord } from '@/lib/whitepages/format-record';
import type { WhitepagesPersonRecord } from '@/lib/whitepages/owner-search';
import {
  collectOwnerRegistryEvidence,
  registrySnippetsBlock,
  type OwnerRegistryEvidence,
} from '@/lib/whitepages/owner-registry-evidence';
import { resolveOwnerSearchContext } from '@/lib/whitepages/owner-search';

const OWNER_MATCH_MODEL =
  process.env.ANTHROPIC_OWNER_MATCH_MODEL || 'claude-sonnet-4-20250514';

export interface OwnerKeywordMatchInput {
  name?: string;
  region?: string;
  address?: string;
  keywords?: string;
  candidates: WhitepagesPersonRecord[];
}

export interface OwnerKeywordAnalysis {
  keyword_match_score: number;
  summary_zh: string;
  rationale_zh: string;
  matched_signals: string[];
  evidence: Array<{ title: string; url: string }>;
}

export interface OwnerKeywordMatchResult {
  updated_at: string;
  model: string;
  analyses: Record<string, OwnerKeywordAnalysis>;
  results: WhitepagesPersonRecord[];
  web_snippets_used: number;
  registry_snippets_used: number;
  opencorporates_companies_found: number;
}

interface WebSnippet {
  title: string;
  url: string;
  content: string;
  source: 'general' | 'people_search' | 'business' | 'registry';
}

function quotedIfHasSpace(v: string): string {
  return /\s/.test(v) ? `"${v}"` : v;
}

function clampPct(n: unknown): number {
  if (typeof n !== 'number' || Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function candidateId(record: WhitepagesPersonRecord, idx: number): string {
  return typeof record.id === 'string' && record.id.trim()
    ? record.id.trim()
    : `candidate-${idx}`;
}

function candidateSummaryBlock(record: WhitepagesPersonRecord, idx: number): string {
  const card = formatOwnerRecord(record);
  const lines = [
    `[${idx}] id=${candidateId(record, idx)}`,
    `姓名: ${card.name}`,
    card.aliases.length ? `别称: ${card.aliases.join(', ')}` : null,
    card.companyName ? `公司: ${card.companyName}` : null,
    card.jobTitle ? `职务: ${card.jobTitle}` : null,
    card.phones.length
      ? `电话: ${card.phones.map((p) => p.number).slice(0, 3).join(', ')}`
      : null,
    card.currentAddresses.length
      ? `现居: ${card.currentAddresses.slice(0, 2).join(' | ')}`
      : null,
    card.ownedProperties.length
      ? `房产: ${card.ownedProperties.slice(0, 2).join(' | ')}`
      : null,
    card.relatives.length ? `亲属: ${card.relatives.join(', ')}` : null,
    card.matchScore != null ? `Whitepages match_score: ${card.matchScore}` : null,
  ].filter(Boolean);
  return lines.join('\n');
}

export function buildOwnerKeywordWebQueries(input: {
  name?: string;
  region?: string;
  address?: string;
  keywords: string;
}): { generalQueries: string[]; peopleQueries: string[]; businessQueries: string[] } {
  const namePart = input.name?.trim() ? quotedIfHasSpace(input.name.trim()) : '';
  const keywords = quotedIfHasSpace(input.keywords.trim());
  const region = input.region?.trim() ? quotedIfHasSpace(input.region.trim()) : '';
  const address = input.address?.trim() ? quotedIfHasSpace(input.address.trim()) : '';

  const generalQueries = [
    [namePart, keywords, address, region].filter(Boolean).join(' '),
    [keywords, address, 'restaurant owner', region].filter(Boolean).join(' '),
    [namePart, keywords, address, 'restaurant'].filter(Boolean).join(' '),
  ];

  const peopleQueries = [
    [namePart, region, address, keywords].filter(Boolean).join(' '),
    [namePart, address, region, 'phone'].filter(Boolean).join(' '),
  ];

  const businessQueries = [
    [namePart, keywords, address].filter(Boolean).join(' '),
    [keywords, address, 'owner', region].filter(Boolean).join(' '),
  ];

  const dedup = (arr: string[]) => {
    const seen = new Set<string>();
    return arr
      .map((q) => q.replace(/\s+/g, ' ').trim())
      .filter((q) => {
        if (!q || seen.has(q)) return false;
        seen.add(q);
        return true;
      });
  };

  return {
    generalQueries: dedup(generalQueries),
    peopleQueries: dedup(peopleQueries),
    businessQueries: dedup(businessQueries),
  };
}

async function collectWebSnippets(input: {
  name?: string;
  region?: string;
  address?: string;
  keywords: string;
  searchOverride?: () => Promise<WebSnippet[]>;
}): Promise<WebSnippet[]> {
  if (input.searchOverride) return input.searchOverride();

  const queries = buildOwnerKeywordWebQueries(input);
  const seen = new Set<string>();
  const merged: WebSnippet[] = [];

  const push = (rows: Array<{ title: string; url: string; content: string }>, source: WebSnippet['source']) => {
    for (const row of rows) {
      if (!row.url || seen.has(row.url)) continue;
      seen.add(row.url);
      merged.push({ ...row, source });
      if (merged.length >= 24) return true;
    }
    return false;
  };

  const generalBatches = await Promise.all(
    queries.generalQueries.map((q) => tavilySearchSnippets(q).catch(() => [])),
  );
  for (const batch of generalBatches) {
    if (push(batch, 'general')) return merged;
  }

  const bucketRows: TavilySnippetWithBucket[] = await runTavilyTwoBucketSearch({
    peopleQueries: queries.peopleQueries,
    businessQueries: queries.businessQueries,
  });
  for (const row of bucketRows) {
    if (!row.url || seen.has(row.url)) continue;
    seen.add(row.url);
    merged.push({
      title: row.title,
      url: row.url,
      content: row.content,
      source: row.bucket,
    });
    if (merged.length >= 24) break;
  }

  return merged;
}

function snippetsBlock(snippets: WebSnippet[]): string {
  if (snippets.length === 0) {
    return '（未配置 TAVILY_API_KEY 或搜索无结果：请主要依据 Whitepages 结构化字段评分，并在 rationale_zh 说明联网证据有限。）';
  }
  return snippets
    .map(
      (s, i) =>
        `[${i + 1}] (${s.source}) ${s.title}\nURL: ${s.url}\n${s.content}`,
    )
    .join('\n\n');
}

const KEYWORD_MATCH_BATCH_SIZE = 5;

export type OwnerKeywordScoreRow = {
  idx?: unknown;
  id?: unknown;
  keyword_match_score?: unknown;
  summary_zh?: unknown;
  rationale_zh?: unknown;
  matched_signals?: unknown;
};

/** 解析 Claude 返回的评分 JSON（容错 markdown、截断数组） */
export function parseOwnerKeywordMatchJson(text: string): OwnerKeywordScoreRow[] | null {
  const t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fence ? fence[1] : t).trim();
  const start = body.indexOf('[');
  if (start < 0) return null;

  const slice = body.slice(start);
  const tryParse = (json: string): OwnerKeywordScoreRow[] | null => {
    try {
      const parsed = JSON.parse(json);
      return Array.isArray(parsed) ? (parsed as OwnerKeywordScoreRow[]) : null;
    } catch {
      return null;
    }
  };

  const end = slice.lastIndexOf(']');
  if (end > 0) {
    const full = tryParse(slice.slice(0, end + 1));
    if (full) return full;
  }

  // 输出被 max_tokens 截断时，尽量保留已完成的 object
  let lastBrace = slice.lastIndexOf('}');
  while (lastBrace > 0) {
    const repaired = tryParse(`${slice.slice(0, lastBrace + 1)}]`);
    if (repaired && repaired.length > 0) return repaired;
    lastBrace = slice.lastIndexOf('}', lastBrace - 1);
  }

  return null;
}

function chunkCandidates<T>(items: T[], size: number): T[][] {
  if (items.length <= size) return [items];
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

function normalizeSignals(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s) => (typeof s === 'string' ? s.trim() : ''))
    .filter(Boolean)
    .slice(0, 8);
}

export interface RunOwnerKeywordMatchOptions {
  anthropic?: Anthropic;
  searchOverride?: () => Promise<WebSnippet[]>;
  registryEvidenceOverride?: () => Promise<OwnerRegistryEvidence>;
}

export async function runOwnerKeywordMatch(
  input: OwnerKeywordMatchInput,
  options: RunOwnerKeywordMatchOptions = {},
): Promise<OwnerKeywordMatchResult> {
  const ctx = resolveOwnerSearchContext(input);
  const keywords = ctx.keywordsForMatch;
  if (keywords.length < 2) {
    throw new Error('EMPTY_KEYWORDS');
  }
  if (!input.candidates.length) {
    throw new Error('NO_CANDIDATES');
  }
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }

  const nameForPrompt = ctx.nameForPrompt;

  const [snippets, registryEvidence] = await Promise.all([
    collectWebSnippets({
      name: nameForPrompt,
      region: input.region,
      address: input.address,
      keywords,
      searchOverride: options.searchOverride,
    }),
    options.registryEvidenceOverride
      ? options.registryEvidenceOverride()
      : collectOwnerRegistryEvidence({
          name: nameForPrompt,
          region: input.region,
          address: input.address,
          keywords,
        }),
  ]);

  const registrySnippets: WebSnippet[] = registryEvidence.registry_web_snippets.map((s) => ({
    ...s,
    source: 'registry' as const,
  }));
  const allSnippets = [...snippets, ...registrySnippets];

  const evidencePool = allSnippets.map((s) => ({ title: s.title, url: s.url }));

  const hasExternalEvidence =
    allSnippets.length > 0 || registryEvidence.opencorporates_companies.length > 0;

  const system = `你是餐饮 B2B 销售情报专家。任务：根据「匹配关键字」、OpenCorporates 企业登记、政府 Secretary of State 工商注册信息与公开网页，对 Whitepages 同名/近似名候选人逐一深度交叉验证打分，判断哪一位最可能是目标餐厅老板/经营者。

评分规则（按证据权重）：
- keyword_match_score：0-100 整数。
- 高权重（单项可 +25~40）：OpenCorporates 中 officer/director/agent 姓名与候选人一致；政府登记页（CA SOS BizFile、TX SOS 等）显示该人为 LLC/Corp 高管且公司名与关键字一致；注册地址与用户输入地址或 Whitepages 现居地址高度吻合（街道/邮编/城市）。
- 中权重：全网摘要中的店名、职务、LinkedIn、媒体报道与关键字一致。
- 低权重：仅姓名相似、地区接近但无公司/店名/地址佐证 → 分数应 ≤25。
- 若 OpenCorporates officer + 政府登记 + 地址三线一致，分数应 ≥85。
- 若店名+地区+职务与关键字和网页一致但无登记信息，分数约 65~80。
- 同名歧义：在 rationale_zh 说明为何排除其它候选人；matched_signals 列出命中的具体线索（中文短语，每条 ≤40 字），优先标注「OpenCorporates」「政府登记」「地址吻合」等来源。
- 无 OpenCorporates/登记/联网摘要时，主要依据 Whitepages 与关键字字面匹配，分数上限 55。

输出：仅一个 JSON 数组，按输入候选 idx 顺序，每项字段尽量简短：
{"idx":0,"keyword_match_score":82,"summary_zh":"≤50字","rationale_zh":"≤80字","matched_signals":["OpenCorporates 董事一致","地址吻合"]}
禁止 markdown，禁止其它文字，禁止在 JSON 外添加解释。`;

  const sharedContext = `【搜索姓名】${nameForPrompt}
【地区】${input.region?.trim() || '—'}
【用户输入地址（用于与注册地址/现居地址交叉比对）】
${input.address?.trim() || '—'}
【匹配关键字（店名/DBA/公司/电话/亲属/地址线索）】
${keywords}

【OpenCorporates API 企业登记（管辖区 ${registryEvidence.jurisdiction_code}，${registryEvidence.opencorporates_companies.length} 条）】
${registryEvidence.opencorporates_prompt}

【政府登记 / OpenCorporates 定向网页（${registrySnippets.length} 条）】
${registrySnippetsBlock(registryEvidence.registry_web_snippets)}

【全网 / 人物 / 商业搜索摘要（${snippets.length} 条）】
${snippetsBlock(snippets)}`;

  const client =
    options.anthropic ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  async function requestScores(
    batch: WhitepagesPersonRecord[],
    idxOffset: number,
    compact: boolean,
  ): Promise<OwnerKeywordScoreRow[]> {
    const blocks = batch
      .map((record, localIdx) => candidateSummaryBlock(record, idxOffset + localIdx))
      .join('\n\n');
    const user = `${sharedContext}

【本批 Whitepages 候选人（idx ${idxOffset}–${idxOffset + batch.length - 1}，共 ${batch.length} 人）】
${blocks}

必须为上述每一位输出一条评分，idx 使用方括号中的全局编号。`;

    const message = await client.messages.create({
      model: OWNER_MATCH_MODEL,
      max_tokens: compact
        ? Math.min(4096, Math.max(800, batch.length * 100))
        : Math.min(8192, Math.max(1500, batch.length * 220)),
      system: compact
        ? `${system}\n\n再次强调：summary_zh≤40字，rationale_zh≤60字，只输出 JSON 数组。`
        : system,
      messages: [{ role: 'user', content: user }],
    });

    const block = message.content[0];
    if (!block || block.type !== 'text') {
      throw new Error('Unexpected response format from Claude');
    }

    const parsed = parseOwnerKeywordMatchJson(block.text);
    if (parsed && parsed.length > 0) return parsed;

    if (!compact) {
      return requestScores(batch, idxOffset, true);
    }
    return [];
  }

  const batches = chunkCandidates(input.candidates, KEYWORD_MATCH_BATCH_SIZE);
  const parsedRows: OwnerKeywordScoreRow[] = [];
  let idxOffset = 0;
  for (const batch of batches) {
    const rows = await requestScores(batch, idxOffset, false);
    parsedRows.push(...rows);
    idxOffset += batch.length;
  }

  if (parsedRows.length === 0) {
    throw new Error('Failed to parse keyword match JSON from model');
  }

  const analyses: Record<string, OwnerKeywordAnalysis> = {};
  const scoreByIdx = new Map<number, number>();

  for (const row of parsedRows) {
    const idx = typeof row.idx === 'number' ? row.idx : Number(row.idx);
    if (!Number.isInteger(idx) || idx < 0 || idx >= input.candidates.length) continue;

    const record = input.candidates[idx]!;
    const id = candidateId(record, idx);
    const noSnippets = !hasExternalEvidence;
    let score = clampPct(row.keyword_match_score);
    if (noSnippets) score = Math.min(score, 55);

    scoreByIdx.set(idx, score);
    analyses[id] = {
      keyword_match_score: score,
      summary_zh: String(row.summary_zh ?? '').slice(0, 200),
      rationale_zh: String(row.rationale_zh ?? '').slice(0, 320),
      matched_signals: normalizeSignals(row.matched_signals),
      evidence: evidencePool.slice(0, 6),
    };
  }

  // 模型漏掉的候选人给默认低分
  input.candidates.forEach((record, idx) => {
    const id = candidateId(record, idx);
    if (analyses[id]) return;
    analyses[id] = {
      keyword_match_score: !hasExternalEvidence ? 15 : 20,
      summary_zh: '模型未返回该候选评分，建议人工核对。',
      rationale_zh: '自动补全低分占位。',
      matched_signals: [],
      evidence: evidencePool.slice(0, 3),
    };
    scoreByIdx.set(idx, analyses[id].keyword_match_score);
  });

  const sorted = [...input.candidates].sort((a, b) => {
    const ia = input.candidates.indexOf(a);
    const ib = input.candidates.indexOf(b);
    const sa = scoreByIdx.get(ia) ?? 0;
    const sb = scoreByIdx.get(ib) ?? 0;
    if (sb !== sa) return sb - sa;
    const wa = typeof a.match_score === 'number' ? a.match_score : 0;
    const wb = typeof b.match_score === 'number' ? b.match_score : 0;
    return wb - wa;
  });

  return {
    updated_at: new Date().toISOString(),
    model: OWNER_MATCH_MODEL,
    analyses,
    results: sorted,
    web_snippets_used: snippets.length,
    registry_snippets_used: registrySnippets.length,
    opencorporates_companies_found: registryEvidence.opencorporates_companies.length,
  };
}
