/**
 * Enrichment 关键 CRITICAL 测试 —— 成本闸门
 *
 * 锁死四个不变量：
 *   1. is_restaurant=false 的 ClassifiedDraft 绝不触发 Google Places 调用（成本 0）
 *   2. 缓存命中（同 draft 已 enrich 过）绝不重复调用 —— fetched=false
 *   3. daily-cap 达到后立即熔断，后续 draft 全返回 null（lead 仍入库，不被丢弃）
 *   4. Google API 5xx / JSON 错误时 graceful degrade：lead 仍入库，enrichment=null
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createGooglePlacesEnricher,
  enrichDrafts,
  _resetEnrichStateForTests,
  getDailyEnrichCount,
} from '@/lib/pipeline/enrich';
import type { ClassifiedDraft } from '@/lib/pipeline/classify';
import type { NormalizedDraft } from '@/lib/sources/types';

function makeClassified(
  name: string,
  isRestaurant: boolean,
  extra: Partial<NormalizedDraft> = {},
): ClassifiedDraft {
  const draft: NormalizedDraft = {
    external_id: `ext-${name}`,
    name,
    address: '123 Market St',
    phone: null,
    cuisine_type: '餐饮',
    city: 'San Francisco',
    metro_area: 'sf_bay',
    source: 'sf_gov',
    license_date: null,
    first_inspection_date: null,
    license_type: null,
    source_raw: {},
    lead_status: 'new',
    ...extra,
  };
  return {
    draft,
    is_restaurant: isRestaurant,
    confidence: isRestaurant ? 0.9 : 0.1,
    raw: null,
  };
}

function makeFetchMock(
  responses: Array<{ ok: boolean; status?: number; json?: unknown }>,
): ReturnType<typeof vi.fn> {
  let cursor = 0;
  return vi.fn(async () => {
    const r = responses[Math.min(cursor, responses.length - 1)];
    cursor += 1;
    return {
      ok: r.ok,
      status: r.status ?? (r.ok ? 200 : 500),
      async json() {
        return r.json ?? {};
      },
    } as Response;
  });
}

describe('enrichDrafts — cost gate CRITICAL', () => {
  beforeEach(() => {
    _resetEnrichStateForTests();
  });

  it('CRITICAL: is_restaurant=false NEVER triggers a Google Places fetch', async () => {
    const fetchSpy = makeFetchMock([{ ok: true, json: { results: [], status: 'OK' } }]);
    const client = createGooglePlacesEnricher({
      apiKey: 'test-key',
      dailyCap: 1000,
      fetchImpl: fetchSpy as unknown as typeof fetch,
    });
    const out = await enrichDrafts(
      [makeClassified('Not a restaurant', false), makeClassified('Yes restaurant', true)],
      { client },
    );
    // 只有 is_restaurant=true 的那条应该触发 fetch
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(out[0].enrichment).toBeNull();
    // 第二条实际返回空 results，enrichment=null 但计数 +1
    expect(getDailyEnrichCount().count).toBe(1);
  });

  it('cache hit: second call with same draft does NOT fetch', async () => {
    const fetchSpy = makeFetchMock([
      {
        ok: true,
        json: {
          status: 'OK',
          results: [
            {
              place_id: 'PLACE_123',
              formatted_phone_number: '415-555-9999',
              business_status: 'OPERATIONAL',
              types: ['restaurant'],
            },
          ],
        },
      },
    ]);
    const client = createGooglePlacesEnricher({
      apiKey: 'test-key',
      dailyCap: 1000,
      fetchImpl: fetchSpy as unknown as typeof fetch,
    });

    const draft = makeClassified('Golden Dragon', true);

    // 第一次：实际 fetch
    const first = await enrichDrafts([draft], { client });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(first[0].enrichment?.fetched).toBe(true);
    expect(first[0].enrichment?.google_place_id).toBe('PLACE_123');

    // 第二次：缓存命中，不再 fetch
    const second = await enrichDrafts([draft], { client });
    expect(fetchSpy).toHaveBeenCalledTimes(1); // 仍是 1
    expect(second[0].enrichment?.fetched).toBe(false);
    expect(second[0].enrichment?.google_place_id).toBe('PLACE_123');
  });

  it('CRITICAL: daily-cap breaker halts subsequent fetches', async () => {
    const fetchSpy = makeFetchMock([
      { ok: true, json: { status: 'OK', results: [{ place_id: 'P1' }] } },
      { ok: true, json: { status: 'OK', results: [{ place_id: 'P2' }] } },
      // 第三次不该被调用
      { ok: true, json: { status: 'OK', results: [{ place_id: 'NEVER' }] } },
    ]);
    const client = createGooglePlacesEnricher({
      apiKey: 'test-key',
      dailyCap: 2, // 每日上限 2 次
      fetchImpl: fetchSpy as unknown as typeof fetch,
    });

    const drafts = [
      makeClassified('R1', true, { external_id: 'a' }),
      makeClassified('R2', true, { external_id: 'b' }),
      makeClassified('R3', true, { external_id: 'c' }), // 这条应被熔断，lead 仍在
    ];

    const out = await enrichDrafts(drafts, { client });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(out).toHaveLength(3); // lead 没有被丢弃
    expect(out[0].enrichment?.google_place_id).toBe('P1');
    expect(out[1].enrichment?.google_place_id).toBe('P2');
    expect(out[2].enrichment).toBeNull(); // 被熔断
  });

  it('HTTP 500 graceful degrade: lead stays, enrichment=null', async () => {
    const fetchSpy = makeFetchMock([{ ok: false, status: 500 }]);
    const client = createGooglePlacesEnricher({
      apiKey: 'test-key',
      dailyCap: 1000,
      fetchImpl: fetchSpy as unknown as typeof fetch,
    });

    const out = await enrichDrafts([makeClassified('Shaky API Cafe', true)], {
      client,
    });
    expect(out).toHaveLength(1);
    expect(out[0].enrichment).toBeNull();
    // draft 本身未改动
    expect(out[0].draft.name).toBe('Shaky API Cafe');
  });

  it('Places REQUEST_DENIED graceful degrade', async () => {
    const fetchSpy = makeFetchMock([
      { ok: true, json: { status: 'REQUEST_DENIED', error_message: 'API key invalid' } },
    ]);
    const client = createGooglePlacesEnricher({
      apiKey: 'bad',
      dailyCap: 1000,
      fetchImpl: fetchSpy as unknown as typeof fetch,
    });
    const out = await enrichDrafts([makeClassified('Cafe', true)], { client });
    expect(out[0].enrichment).toBeNull();
  });

  it('Places ZERO_RESULTS does not crash; enrichment=null', async () => {
    const fetchSpy = makeFetchMock([{ ok: true, json: { status: 'ZERO_RESULTS', results: [] } }]);
    const client = createGooglePlacesEnricher({
      apiKey: 'test-key',
      dailyCap: 1000,
      fetchImpl: fetchSpy as unknown as typeof fetch,
    });
    const out = await enrichDrafts([makeClassified('Nowhere Cafe', true)], { client });
    expect(out[0].enrichment).toBeNull();
  });

  it('parse error in fetch handler: lead preserved, enrichment=null', async () => {
    const fetchSpy = vi.fn(async () => {
      throw new Error('network unreachable');
    });
    const client = createGooglePlacesEnricher({
      apiKey: 'test-key',
      dailyCap: 1000,
      fetchImpl: fetchSpy as unknown as typeof fetch,
    });
    const out = await enrichDrafts([makeClassified('Network Fail Cafe', true)], {
      client,
    });
    expect(out).toHaveLength(1);
    expect(out[0].enrichment).toBeNull();
  });

  it('passes through when no enricher client is provided', async () => {
    const out = await enrichDrafts(
      [makeClassified('Any', true), makeClassified('Other', false)],
      { client: null },
    );
    expect(out).toHaveLength(2);
    expect(out[0].enrichment).toBeNull();
    expect(out[1].enrichment).toBeNull();
  });
});

describe('enrichDrafts with runPipeline integration', () => {
  it('pipeline enrichment call count equals Google Places calls actually made (cost observability)', async () => {
    _resetEnrichStateForTests();
    const fetchSpy = makeFetchMock([
      { ok: true, json: { status: 'OK', results: [{ place_id: 'P1' }] } },
      { ok: true, json: { status: 'OK', results: [{ place_id: 'P2' }] } },
    ]);
    const client = createGooglePlacesEnricher({
      apiKey: 'test-key',
      dailyCap: 1000,
      fetchImpl: fetchSpy as unknown as typeof fetch,
    });

    const drafts = [
      makeClassified('A', true, { external_id: 'a' }),
      makeClassified('B', false, { external_id: 'b' }), // 非餐厅 —— 不调
      makeClassified('C', true, { external_id: 'c' }),
    ];
    const out = await enrichDrafts(drafts, { client });

    // 2 次真实 fetch；1 次非餐厅跳过
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const fetched = out.filter((e) => e.enrichment?.fetched).length;
    expect(fetched).toBe(2);
  });
});
