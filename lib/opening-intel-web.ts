/**
 * 详情页「联网情报」：可选 Tavily + Claude Haiku，结果缓存到 leads.ai_classification.opening_intel_web
 */

import Anthropic from '@anthropic-ai/sdk';
import type { Lead } from '@/types/lead';

const CLASSIFY_MODEL =
  process.env.ANTHROPIC_CLASSIFY_MODEL || 'claude-haiku-4-5-20251001';

export interface OpeningIntelWebEvidence {
  title: string;
  url: string;
}

/** 写入 ai_classification.opening_intel_web 的快照 */
export interface OpeningIntelWebPayload {
  updated_at: string;
  model: string;
  new_opening_confidence: number;
  transfer_confidence: number;
  summary_zh: string;
  rationale_zh: string;
  search_snippets_used: number;
  evidence: OpeningIntelWebEvidence[];
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

function clampPct(n: unknown): number {
  if (typeof n !== 'number' || Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** 从模型回复中宽容解析单对象 JSON */
export function parseOpeningIntelJsonObject(text: string): {
  new_opening_confidence?: unknown;
  transfer_confidence?: unknown;
  summary_zh?: unknown;
  rationale_zh?: unknown;
} | null {
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

export interface TavilySnippet {
  title: string;
  url: string;
  content: string;
}

export async function tavilySearchSnippets(query: string): Promise<TavilySnippet[]> {
  const key = process.env.TAVILY_API_KEY?.trim();
  if (!key) return [];

  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: key,
      query,
      search_depth: 'basic',
      max_results: 5,
      include_answer: false,
    }),
  });

  if (!res.ok) return [];

  const data = (await res.json()) as {
    results?: Array<{ title?: string; url?: string; content?: string }>;
  };
  const rows = data.results ?? [];
  return rows.map((r) => ({
    title: String(r.title ?? ''),
    url: String(r.url ?? ''),
    content: String(r.content ?? '').slice(0, 800),
  }));
}

function leadContextBlock(lead: Lead): string {
  const parts: string[] = [
    `名称: ${lead.name}`,
    `地址: ${lead.address ?? '—'}`,
    `城市: ${lead.city}`,
    `来源: ${lead.source}`,
    `执照/日期: ${lead.license_date ?? '—'}`,
    `菜系: ${lead.cuisine_type ?? '—'}`,
  ];

  const raw = lead.source_raw;
  if (isRecord(raw) && isRecord(raw.opening_signals)) {
    parts.push(`DataSF 规则层 opening_signals: ${JSON.stringify(raw.opening_signals)}`);
  }

  const cls = lead.ai_classification;
  if (isRecord(cls) && isRecord(cls.datasf_opening)) {
    parts.push(`已缓存 datasf_opening: ${JSON.stringify(cls.datasf_opening)}`);
  }

  return parts.join('\n');
}

/**
 * 调用 Claude + 可选联网摘要，生成新开/转手置信度（0–100）与中文摘要。
 */
export async function runOpeningIntelWeb(lead: Lead): Promise<OpeningIntelWebPayload> {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }

  const query = `${lead.name} ${lead.city} restaurant opening change of ownership`;
  const snippets = await tavilySearchSnippets(query);

  const searchBlock =
    snippets.length > 0
      ? snippets
          .map((s, i) => `[${i + 1}] ${s.title}\nURL: ${s.url}\n${s.content}`)
          .join('\n\n')
      : '（未配置 TAVILY_API_KEY 或搜索无结果：请仅依据下方结构化字段推断，并在 summary 中说明依据有限。）';

  const system = `你是餐饮门店情报分析助手。根据用户提供的店铺结构化字段与可选的网页摘要，估计：
- new_opening_confidence：该址/该主体为「新开门店」的置信度 0-100 整数
- transfer_confidence：该址/该主体为「转手/接盘（换老板或换牌续营）」的置信度 0-100 整数

规则：
- 二者可以同时偏高（例如新牌接盘也是新开实体）。
- 仅输出一个 JSON 对象，不要 markdown，不要其它文字。
- 字段：new_opening_confidence, transfer_confidence, summary_zh（≤80字）, rationale_zh（≤120字，简述依据）`;

  const user = `【结构化字段】
${leadContextBlock(lead)}

【网页摘要（可能为空）】
${searchBlock}`;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const message = await client.messages.create({
    model: CLASSIFY_MODEL,
    max_tokens: 400,
    messages: [{ role: 'user', content: user }],
    system,
  });

  const block = message.content[0];
  if (!block || block.type !== 'text') {
    throw new Error('Unexpected response format from Claude');
  }

  const parsed = parseOpeningIntelJsonObject(block.text);
  if (!parsed) {
    throw new Error('Failed to parse opening intel JSON from model');
  }

  const evidence: OpeningIntelWebEvidence[] = snippets.map((s) => ({
    title: s.title,
    url: s.url,
  }));

  return {
    updated_at: new Date().toISOString(),
    model: CLASSIFY_MODEL,
    new_opening_confidence: clampPct(parsed.new_opening_confidence),
    transfer_confidence: clampPct(parsed.transfer_confidence),
    summary_zh: String(parsed.summary_zh ?? '').slice(0, 200),
    rationale_zh: String(parsed.rationale_zh ?? '').slice(0, 300),
    search_snippets_used: snippets.length,
    evidence,
  };
}

/** 合并写入用的 ai_classification（保留 datasf_opening 等已有键） */
export function mergeAiClassificationOpeningWeb(
  existing: unknown,
  payload: OpeningIntelWebPayload,
): Record<string, unknown> {
  const base = isRecord(existing) ? { ...existing } : {};
  return {
    ...base,
    opening_intel_web: payload,
  };
}
