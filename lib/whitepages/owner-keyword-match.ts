/**
 * 老板信息：Whitepages 姓名候选 + 匹配关键字 + Tavily 全网 + Claude Sonnet 交叉验证评分
 */

import Anthropic from '@anthropic-ai/sdk';
import { tavilySearchSnippets } from '@/lib/opening-intel-web';
import {
  runTavilyTwoBucketSearch,
  type TavilySnippetWithBucket,
} from '@/lib/intel/deep-person-intel';
import { formatOwnerRecord } from '@/lib/whitepages/format-record';
import type { WhitepagesPersonRecord } from '@/lib/whitepages/owner-search';

const OWNER_MATCH_MODEL =
  process.env.ANTHROPIC_OWNER_MATCH_MODEL || 'claude-sonnet-4-20250514';

export interface OwnerKeywordMatchInput {
  name: string;
  region?: string;
  keywords: string;
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
}

interface WebSnippet {
  title: string;
  url: string;
  content: string;
  source: 'general' | 'people_search' | 'business';
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
  name: string;
  region?: string;
  keywords: string;
}): { generalQueries: string[]; peopleQueries: string[]; businessQueries: string[] } {
  const name = quotedIfHasSpace(input.name.trim());
  const keywords = quotedIfHasSpace(input.keywords.trim());
  const region = input.region?.trim() ? quotedIfHasSpace(input.region.trim()) : '';

  const generalQueries = [
    [name, keywords, region].filter(Boolean).join(' '),
    [keywords, 'restaurant owner', region].filter(Boolean).join(' '),
    [name, keywords, 'restaurant'].filter(Boolean).join(' '),
  ];

  const peopleQueries = [
    [name, region, keywords].filter(Boolean).join(' '),
    [name, region, 'phone address'].filter(Boolean).join(' '),
  ];

  const businessQueries = [
    [name, keywords].filter(Boolean).join(' '),
    [keywords, 'owner', region].filter(Boolean).join(' '),
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
  name: string;
  region?: string;
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

function parseScoringJson(text: string): Array<{
  idx?: unknown;
  id?: unknown;
  keyword_match_score?: unknown;
  summary_zh?: unknown;
  rationale_zh?: unknown;
  matched_signals?: unknown;
}> | null {
  const t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1].trim() : t;
  const start = body.indexOf('[');
  const end = body.lastIndexOf(']');
  if (start < 0 || end < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(body.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
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
}

export async function runOwnerKeywordMatch(
  input: OwnerKeywordMatchInput,
  options: RunOwnerKeywordMatchOptions = {},
): Promise<OwnerKeywordMatchResult> {
  const keywords = input.keywords.trim();
  if (keywords.length < 2) {
    throw new Error('EMPTY_KEYWORDS');
  }
  if (!input.candidates.length) {
    throw new Error('NO_CANDIDATES');
  }
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }

  const snippets = await collectWebSnippets({
    name: input.name,
    region: input.region,
    keywords,
    searchOverride: options.searchOverride,
  });

  const evidencePool = snippets.map((s) => ({ title: s.title, url: s.url }));
  const candidateBlocks = input.candidates
    .map((record, idx) => candidateSummaryBlock(record, idx))
    .join('\n\n');

  const system = `你是餐饮 B2B 销售情报专家。任务：根据「匹配关键字」与公开网页证据，对 Whitepages 返回的同名/近似名候选人逐一打分，判断哪一位最可能是目标餐厅老板/经营者。

评分规则：
- keyword_match_score：0-100 整数，表示该候选人与匹配关键字的吻合程度（越高越可能是同一人且与餐饮/店名/地址等线索一致）。
- 必须交叉验证：Whitepages 结构化字段 + 网页摘要中的店名、地址、职务、媒体报道、LinkedIn、亲属、电话区号等。
- 若仅有姓名相似但关键字（店名/地址/公司）无任何佐证，分数应 ≤25。
- 若多个字段（店名+地区+职务等）与关键字和网页证据一致，分数应 ≥75。
- 同名歧义：在 rationale_zh 说明为何排除其它候选人；matched_signals 列出命中的具体线索（中文短语，每条 ≤40 字）。
- 无联网摘要时，主要依据 Whitepages 字段与关键字字面/语义匹配，分数上限 55，并在 summary_zh 说明证据有限。

输出：仅一个 JSON 数组，按输入候选 idx 顺序，每项：
{"idx":0,"keyword_match_score":82,"summary_zh":"...","rationale_zh":"...","matched_signals":["店名一致","SF 地址吻合"]}
禁止 markdown，禁止其它文字。`;

  const user = `【搜索姓名】${input.name}
【地区】${input.region?.trim() || '—'}
【匹配关键字（交叉验证用，可含店名/地址/公司/电话/亲属等任意相关信息）】
${keywords}

【全网搜索摘要（${snippets.length} 条）】
${snippetsBlock(snippets)}

【Whitepages 候选人（共 ${input.candidates.length} 人）】
${candidateBlocks}`;

  const client =
    options.anthropic ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const message = await client.messages.create({
    model: OWNER_MATCH_MODEL,
    max_tokens: Math.max(1200, input.candidates.length * 120),
    system,
    messages: [{ role: 'user', content: user }],
  });

  const block = message.content[0];
  if (!block || block.type !== 'text') {
    throw new Error('Unexpected response format from Claude');
  }

  const parsedRows = parseScoringJson(block.text);
  if (!parsedRows) {
    throw new Error('Failed to parse keyword match JSON from model');
  }

  const analyses: Record<string, OwnerKeywordAnalysis> = {};
  const scoreByIdx = new Map<number, number>();

  for (const row of parsedRows) {
    const idx = typeof row.idx === 'number' ? row.idx : Number(row.idx);
    if (!Number.isInteger(idx) || idx < 0 || idx >= input.candidates.length) continue;

    const record = input.candidates[idx]!;
    const id = candidateId(record, idx);
    const noSnippets = snippets.length === 0;
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
      keyword_match_score: snippets.length === 0 ? 15 : 20,
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
  };
}
