/**
 * Classify 层 —— AI 判断"是不是真餐厅"+ 菜系猜测
 *
 * Phase 1: pass-through（is_restaurant=true, confidence=null）—— 行为与旧 pipeline 一致
 * Phase 2: 接 Claude Haiku 批量分类（20 条/批）+ 本地 Map 缓存（同 name+address+city 24h 内不重复）
 *
 * 设计原则：
 *   - 成本闸门：下游 enrich 只对 is_restaurant=true 且 confidence>0.6 的 draft 调用外部 API
 *   - 金样集回归：tests/pipeline/classify.test.ts 会用 50 条人工标注验证召回率/精确率
 *   - 批内 1 条失败不丢整批（宽容解析 JSON）
 */

import type { NormalizedDraft } from '@/lib/sources/types';

export interface ClassifiedDraft {
  draft: NormalizedDraft;
  is_restaurant: boolean;
  confidence: number | null;
  /** 模型原始输出 JSON（入 leads.ai_classification） */
  raw: Record<string, unknown> | null;
}

export interface ClassifyOptions {
  /** 置信度阈值；低于此值的条目 is_restaurant 会被设为 false */
  minConfidence?: number;
  /** 注入 classifier（测试用） */
  classifier?: BatchClassifier;
}

export interface BatchClassifier {
  classify(
    drafts: readonly NormalizedDraft[],
  ): Promise<
    Array<{
      is_restaurant: boolean;
      confidence: number;
      cuisine_guess: string | null;
      raw: Record<string, unknown>;
    }>
  >;
}

/**
 * 默认 classifier：
 *   - 有 ANTHROPIC_API_KEY → Claude Haiku 批量分类（Phase 2）
 *   - 无 key → null（Phase 1 pass-through）
 */
export function defaultClassifier(): BatchClassifier | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  return createHaikuClassifier();
}

// ============================================================================
// Claude Haiku 批量分类实现
// ============================================================================

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const BATCH_SIZE = 20;

interface CacheEntry {
  result: {
    is_restaurant: boolean;
    confidence: number;
    cuisine_guess: string | null;
    raw: Record<string, unknown>;
  };
  expiresAt: number;
}
// 进程内缓存：24h 内同 (source, external_id OR name+address+city) 不重复调用
const classifyCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function cacheKey(d: NormalizedDraft): string {
  return d.external_id
    ? `${d.source}::${d.external_id}`
    : `${(d.name || '').toLowerCase()}::${(d.address || '').toLowerCase()}::${(d.city || '').toLowerCase()}`;
}

function signalText(d: NormalizedDraft): string {
  const bits = [
    `name: ${d.name}`,
    d.cuisine_type ? `raw_cuisine: ${d.cuisine_type}` : null,
    d.license_type ? `license_type: ${d.license_type}` : null,
    d.city ? `city: ${d.city}` : null,
  ].filter(Boolean);
  return bits.join(' | ');
}

export function createHaikuClassifier(): BatchClassifier {
  return {
    async classify(drafts) {
      if (drafts.length === 0) return [];

      // 分离缓存命中 / 未命中
      const results: Array<{
        is_restaurant: boolean;
        confidence: number;
        cuisine_guess: string | null;
        raw: Record<string, unknown>;
      } | null> = new Array(drafts.length).fill(null);

      const uncachedIdx: number[] = [];
      const now = Date.now();
      drafts.forEach((d, i) => {
        const hit = classifyCache.get(cacheKey(d));
        if (hit && hit.expiresAt > now) {
          results[i] = hit.result;
        } else {
          uncachedIdx.push(i);
        }
      });

      // 分批调 Claude
      for (let start = 0; start < uncachedIdx.length; start += BATCH_SIZE) {
        const batchIdx = uncachedIdx.slice(start, start + BATCH_SIZE);
        const batch = batchIdx.map((i) => drafts[i]);
        try {
          const batchResults = await callHaikuBatch(batch);
          batchIdx.forEach((globalIdx, j) => {
            const r = batchResults[j];
            if (r) {
              results[globalIdx] = r;
              classifyCache.set(cacheKey(drafts[globalIdx]), {
                result: r,
                expiresAt: now + CACHE_TTL_MS,
              });
            }
          });
        } catch (err) {
          // 整批失败：宽容降级 —— 保守视为餐厅但 confidence=0（高层可据此过滤）
          console.warn('[classify] batch failed, falling back to confidence=0:', err);
          batchIdx.forEach((globalIdx) => {
            results[globalIdx] = {
              is_restaurant: true,
              confidence: 0,
              cuisine_guess: null,
              raw: {
                error: err instanceof Error ? err.message : String(err),
                model: DEFAULT_MODEL,
              },
            };
          });
        }
      }

      // 兜底：仍为 null 的用 confidence=0 填
      return results.map(
        (r) =>
          r ?? {
            is_restaurant: true,
            confidence: 0,
            cuisine_guess: null,
            raw: { error: 'no result' },
          },
      );
    },
  };
}

async function callHaikuBatch(
  batch: readonly NormalizedDraft[],
): Promise<
  Array<{
    is_restaurant: boolean;
    confidence: number;
    cuisine_guess: string | null;
    raw: Record<string, unknown>;
  }>
> {
  // 动态引入：测试时可 mock；同时避免 edge 运行时冷启动
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const model = process.env.ANTHROPIC_CLASSIFY_MODEL || DEFAULT_MODEL;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  const items = batch
    .map((d, i) => `${i}. ${signalText(d)}`)
    .join('\n');

  const systemPrompt = `You are a restaurant data classifier. For each business listed below, judge:
  1. is_restaurant: whether it is truly a food service business open to the public
     (true restaurant / cafe / bar / bakery / food truck / catering serving end consumers).
     FALSE examples: food distributor, school cafeteria operator, commissary kitchen,
     grocery store, vending machine company, senior care dining, hospital food service.
  2. confidence: 0.0..1.0
  3. cuisine_guess: short Chinese label if detectable (川菜/粤菜/湘菜/台湾菜/东北菜/中餐/日料/韩餐/美式/墨西哥/意餐/泰餐/越南菜/...), else null.

  Return STRICT JSON array in this schema, preserving input order (one item per input line):
  [{"idx":0,"is_restaurant":true,"confidence":0.92,"cuisine_guess":"中餐"}, ...]
  Do not wrap with prose. Do not emit trailing comma.`;

  const userPrompt = `Classify the following ${batch.length} businesses:\n${items}`;

  const message = await client.messages.create({
    model,
    max_tokens: Math.max(512, batch.length * 60),
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const content = message.content[0];
  if (!content || content.type !== 'text') {
    throw new Error('Unexpected response format from Claude');
  }

  const text = content.text.trim();
  // 宽容解析：找第一个 [ ... ]
  const startIdx = text.indexOf('[');
  const endIdx = text.lastIndexOf(']');
  if (startIdx < 0 || endIdx < 0) {
    throw new Error(`No JSON array in response: ${text.slice(0, 200)}`);
  }
  const parsed = JSON.parse(text.slice(startIdx, endIdx + 1)) as Array<{
    idx?: number;
    is_restaurant?: boolean;
    confidence?: number;
    cuisine_guess?: string | null;
  }>;

  if (!Array.isArray(parsed)) {
    throw new Error('Response is not an array');
  }

  // 按 idx 重排到输入顺序；缺失 idx 的槽位留 null（上层按 "no result" 降级）
  const indexed = new Map<number, (typeof parsed)[number]>();
  parsed.forEach((p, i) => indexed.set(p.idx ?? i, p));

  return batch.map((_, i) => {
    const p = indexed.get(i);
    if (!p || typeof p.is_restaurant !== 'boolean' || typeof p.confidence !== 'number') {
      return {
        is_restaurant: true,
        confidence: 0,
        cuisine_guess: null,
        raw: { error: 'malformed entry', model, idx: i },
      };
    }
    return {
      is_restaurant: p.is_restaurant,
      confidence: Math.max(0, Math.min(1, p.confidence)),
      cuisine_guess: p.cuisine_guess ?? null,
      raw: { model, is_restaurant: p.is_restaurant, confidence: p.confidence, cuisine_guess: p.cuisine_guess ?? null },
    };
  });
}

/** 测试辅助：清空 classify 进程内缓存 */
export function _resetClassifyCacheForTests(): void {
  classifyCache.clear();
}

export async function classifyDrafts(
  drafts: readonly NormalizedDraft[],
  opts: ClassifyOptions = {},
): Promise<ClassifiedDraft[]> {
  const classifier = opts.classifier ?? defaultClassifier();

  if (!classifier) {
    // Phase 1 pass-through：全部视为餐厅，confidence=null（UI 按此值 >= 阈值过滤时空值会被跳过）
    return drafts.map((d) => ({
      draft: d,
      is_restaurant: true,
      confidence: null,
      raw: null,
    }));
  }

  const minConf = opts.minConfidence ?? 0.6;
  const results = await classifier.classify(drafts);

  return drafts.map((draft, i) => {
    const r = results[i];
    if (!r) {
      // 批内 1 条失败（classifier 返回数组长度不足）：保守视为餐厅但 confidence=0
      return {
        draft,
        is_restaurant: true,
        confidence: 0,
        raw: { error: 'classifier returned no result' },
      };
    }
    return {
      draft,
      is_restaurant: r.is_restaurant && r.confidence >= minConf,
      confidence: r.confidence,
      raw: r.raw,
    };
  });
}
