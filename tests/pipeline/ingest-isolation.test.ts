/**
 * REGRESSION TEST
 *
 * 保护 lib/pipeline/ingest.ts 的关键不变量：
 *   - 一个源 throw（网络错误 / API 挂）不能让整批导入失败
 *   - failed 源必须出现在 sourceResults 里，ok=false，带 error 信息
 *   - 其他源的 drafts 必须完整返回
 *
 * 旧实现 lib/bay-area-food-import/index.ts 曾用 Promise.all，会炸整批。
 * 这个测试锁死新实现必须用 Promise.allSettled 等价语义。
 */

import { describe, it, expect } from 'vitest';
import { ingestAll } from '@/lib/pipeline/ingest';
import type { FoodDataSource, NormalizedDraft } from '@/lib/sources/types';

function makeSource(
  id: string,
  behaviour: 'ok' | 'throw' | 'reject' | 'http_err',
  draftCount = 1,
): FoodDataSource {
  return {
    id,
    label: `Test ${id}`,
    metro: 'sf_bay',
    state: 'CA',
    kind: 'registration',
    portalUrl: 'https://example.com/',
    rateLimit: { rps: 10 },
    enabled: true,
    async fetchAndNormalize() {
      if (behaviour === 'throw') {
        throw new Error(`boom from ${id}`);
      }
      if (behaviour === 'reject') {
        return Promise.reject(new Error(`reject from ${id}`));
      }
      if (behaviour === 'http_err') {
        return {
          result: {
            id,
            label: `Test ${id}`,
            ok: false,
            fetched: 0,
            error: 'HTTP 500',
          },
          drafts: [],
        };
      }
      const drafts: NormalizedDraft[] = Array.from({ length: draftCount }, (_, i) => ({
        external_id: `${id}-${i}`,
        name: `Store ${id} #${i}`,
        address: '123 Main St',
        phone: null,
        cuisine_type: 'Cafe',
        city: 'San Francisco',
        metro_area: 'sf_bay',
        source: id,
        license_date: '2026-04-01',
        first_inspection_date: null,
        license_type: null,
        source_raw: {},
        lead_status: 'new',
      }));
      return {
        result: { id, label: `Test ${id}`, ok: true, fetched: drafts.length },
        drafts,
      };
    },
  };
}

describe('ingestAll (pipeline)', () => {
  it('returns empty results when no sources', async () => {
    const { sourceResults, drafts } = await ingestAll([], { lookbackDays: 30 });
    expect(sourceResults).toEqual([]);
    expect(drafts).toEqual([]);
  });

  it('fan-outs all sources and collects drafts', async () => {
    const sources = [makeSource('a', 'ok', 2), makeSource('b', 'ok', 3)];
    const { sourceResults, drafts } = await ingestAll(sources, {
      lookbackDays: 30,
    });
    expect(sourceResults).toHaveLength(2);
    expect(sourceResults.every((r) => r.ok)).toBe(true);
    expect(drafts).toHaveLength(5);
  });

  it('CRITICAL REGRESSION: one source throwing does NOT break others', async () => {
    const sources = [
      makeSource('ok_a', 'ok', 2),
      makeSource('explode', 'throw'),
      makeSource('ok_b', 'ok', 3),
    ];
    const { sourceResults, drafts } = await ingestAll(sources, {
      lookbackDays: 30,
    });
    // 所有 3 个源都要出现在 results 里
    expect(sourceResults).toHaveLength(3);

    const okA = sourceResults.find((r) => r.id === 'ok_a');
    const okB = sourceResults.find((r) => r.id === 'ok_b');
    const failed = sourceResults.find((r) => r.id === 'explode');

    expect(okA?.ok).toBe(true);
    expect(okB?.ok).toBe(true);
    expect(failed?.ok).toBe(false);
    expect(failed?.error).toContain('boom from explode');

    // 2 + 3 = 5 drafts from healthy sources
    expect(drafts).toHaveLength(5);
  });

  it('handles rejected promise (async thrown)', async () => {
    const sources = [makeSource('ok', 'ok', 1), makeSource('bad', 'reject')];
    const { sourceResults, drafts } = await ingestAll(sources, {
      lookbackDays: 30,
    });
    expect(drafts).toHaveLength(1);
    expect(sourceResults.find((r) => r.id === 'bad')?.ok).toBe(false);
  });

  it('preserves adapter-reported errors (HTTP 500 style, not an exception)', async () => {
    const sources = [makeSource('ok', 'ok', 1), makeSource('http_err', 'http_err')];
    const { sourceResults, drafts } = await ingestAll(sources, {
      lookbackDays: 30,
    });
    expect(drafts).toHaveLength(1);
    const err = sourceResults.find((r) => r.id === 'http_err');
    expect(err?.ok).toBe(false);
    expect(err?.error).toBe('HTTP 500');
  });

  it('respects concurrency limit (sanity: all complete within reasonable time)', async () => {
    const sources = Array.from({ length: 8 }, (_, i) => makeSource(`src_${i}`, 'ok', 1));
    const start = Date.now();
    const { sourceResults, drafts } = await ingestAll(sources, {
      lookbackDays: 30,
    });
    const elapsed = Date.now() - start;
    expect(sourceResults).toHaveLength(8);
    expect(drafts).toHaveLength(8);
    // 每源几乎瞬间完成，全部应该在 500ms 内（即使并发=4 分两轮）
    expect(elapsed).toBeLessThan(500);
  });
});
