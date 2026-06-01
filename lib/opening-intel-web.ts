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

/** 联网情报场景（与 CRM lead_status 无关） */
export type OpeningIntelScenario =
  | 'new_opening_likely'
  | 'transfer_likely'
  | 'existing_permit_renewal'
  | 'insufficient_evidence';

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
  /** 结构化场景；旧数据可能缺省 */
  scenario?: OpeningIntelScenario;
  /** 与 scenario 对应的中文短标签（供 UI） */
  scenario_label_zh?: string;
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
  scenario?: unknown;
  scenario_label_zh?: unknown;
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
  if (isRecord(cls) && isRecord(cls.nyc_opening)) {
    parts.push(`NYC DOHMH inspection_type 规则层: ${JSON.stringify(cls.nyc_opening)}`);
  }

  return parts.join('\n');
}

const SCENARIO_LABELS: Record<OpeningIntelScenario, string> = {
  new_opening_likely: '更可能为新开门店',
  transfer_likely: '更可能为转手/接盘',
  existing_permit_renewal: '已存在店铺，牌照更新',
  insufficient_evidence: '证据不足',
};

function normalizeScenario(raw: unknown): OpeningIntelScenario {
  const s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (
    s === 'existing_permit_renewal' ||
    s === 'existing_business' ||
    s === 'permit_renewal' ||
    s === 'renewal'
  ) {
    return 'existing_permit_renewal';
  }
  if (s === 'transfer_likely' || s === 'transfer') return 'transfer_likely';
  if (s === 'new_opening_likely' || s === 'new_opening') return 'new_opening_likely';
  return 'insufficient_evidence';
}

/**
 * 基于摘要/摘要条中的「大量评论、多年经营、续期」等模式压低新开/转手分，并纠正场景。
 * （导出供单元测试）
 */
export function applyOpeningIntelHeuristics(args: {
  lead: Lead;
  snippets: TavilySnippet[];
  parsed: Record<string, unknown>;
  newPct: number;
  transferPct: number;
  scenario: OpeningIntelScenario;
}): { newPct: number; transferPct: number; scenario: OpeningIntelScenario } {
  let { newPct, transferPct, scenario } = args;
  const blob = [
    String(args.parsed.summary_zh ?? ''),
    String(args.parsed.rationale_zh ?? ''),
    ...args.snippets.map((s) => `${s.title} ${s.content}`),
  ]
    .join('\n')
    .toLowerCase();

  const manyReviews =
    /\b([3-9]\d|\d{3,})\s*reviews?\b/i.test(blob) ||
    /\b\d{2,}\s*条(评价|评论)/.test(blob) ||
    /\byelp\b.*\b\d{2,}\b/.test(blob);

  const longRunningHints =
    /多年|数年|长期经营|老牌|established\s+\d{4}|operating\s+for\s+(many\s+)?years|since\s+\d{4}/i.test(
      blob,
    );

  if (manyReviews || longRunningHints) {
    scenario = 'existing_permit_renewal';
    newPct = Math.min(newPct, 12);
    transferPct = Math.min(transferPct, 12);
  }

  return { newPct, transferPct, scenario };
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
- scenario：下列之一（英文枚举，必须小写）：
  - new_opening_likely — 更像真实新开
  - transfer_likely — 更像转手/接盘
  - existing_permit_renewal — 明显为已营业多年的老店，政府侧日期更像例行检查/续牌/续期而非新开业（例如点评/Yelp 已有大量历史评论、媒体报道多年经营等）
  - insufficient_evidence — 证据不足

规则：
- 若摘要或常识表明店铺已长期营业（如「200+ reviews」「多年」「since 20xx 年」），必须把 scenario 设为 existing_permit_renewal，并把 new_opening_confidence、transfer_confidence 都压到 ≤15。
- 二者可以同时偏高仅适用于**确实可能**新牌接盘且无明显长期营业反证时。
- 仅输出一个 JSON 对象，不要 markdown，不要其它文字。
- 字段：new_opening_confidence, transfer_confidence, scenario, summary_zh（≤80字）, rationale_zh（≤120字，简述依据）`;

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

  let newPct = clampPct(parsed.new_opening_confidence);
  let transferPct = clampPct(parsed.transfer_confidence);
  let scenario = normalizeScenario(parsed.scenario);

  const tuned = applyOpeningIntelHeuristics({
    lead,
    snippets,
    parsed: parsed as Record<string, unknown>,
    newPct,
    transferPct,
    scenario,
  });
  newPct = tuned.newPct;
  transferPct = tuned.transferPct;
  scenario = tuned.scenario;

  const scenario_label_zh =
    scenario === 'existing_permit_renewal'
      ? SCENARIO_LABELS.existing_permit_renewal
      : typeof parsed.scenario_label_zh === 'string' && parsed.scenario_label_zh.trim()
        ? String(parsed.scenario_label_zh).slice(0, 40)
        : SCENARIO_LABELS[scenario];

  const evidence: OpeningIntelWebEvidence[] = snippets.map((s) => ({
    title: s.title,
    url: s.url,
  }));

  return {
    updated_at: new Date().toISOString(),
    model: CLASSIFY_MODEL,
    new_opening_confidence: newPct,
    transfer_confidence: transferPct,
    summary_zh: String(parsed.summary_zh ?? '').slice(0, 200),
    rationale_zh: String(parsed.rationale_zh ?? '').slice(0, 300),
    search_snippets_used: snippets.length,
    evidence,
    scenario,
    scenario_label_zh,
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
