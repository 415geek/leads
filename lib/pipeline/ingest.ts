/**
 * Ingest 层 —— 并发拉取 N 个 FoodDataSource，错误隔离
 *
 * 关键不变量：
 *   - 一源失败必须不影响其他（Promise.allSettled）
 *   - 每源 rateLimit.rps 在 adapter 内部自行控制（ingest 只做并发 fan-out）
 *   - 外层 cron 可能一次跑 8 源；用 concurrency limit 防止同时开 8 个 HTTP 连接池爆炸
 */

import type { FoodDataSource, NormalizedDraft, SourceFetchResult } from '@/lib/sources/types';

const DEFAULT_CONCURRENCY = 4;

function computeSinceDate(lookbackDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() - lookbackDays);
  return d.toISOString().split('T')[0];
}

async function runWithLimit<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      try {
        const r = await worker(items[i]);
        results[i] = { status: 'fulfilled', value: r };
      } catch (err) {
        results[i] = { status: 'rejected', reason: err };
      }
    }
  });
  await Promise.all(runners);
  return results;
}

export async function ingestAll(
  sources: readonly FoodDataSource[],
  opts: { lookbackDays: number; limit?: number },
  concurrency = DEFAULT_CONCURRENCY,
): Promise<{ sourceResults: SourceFetchResult[]; drafts: NormalizedDraft[] }> {
  const settled = await runWithLimit(sources, concurrency, (src) => {
    const days = src.lookbackDays ?? opts.lookbackDays;
    const sinceDate = computeSinceDate(days);
    return src.fetchAndNormalize({ sinceDate, limit: opts.limit });
  });

  const sourceResults: SourceFetchResult[] = [];
  const drafts: NormalizedDraft[] = [];

  settled.forEach((s, i) => {
    const src = sources[i];
    if (s.status === 'fulfilled') {
      sourceResults.push(s.value.result);
      drafts.push(...s.value.drafts);
    } else {
      sourceResults.push({
        id: src.id,
        label: src.label,
        ok: false,
        fetched: 0,
        error:
          s.reason instanceof Error
            ? s.reason.message
            : String(s.reason ?? 'unknown error'),
      });
    }
  });

  return { sourceResults, drafts };
}
