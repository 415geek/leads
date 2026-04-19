/**
 * /api/leads/import 的纯函数层测试
 *
 * 不连 HTTP / Supabase，直接测：
 *   - decideImportMode：body 路由到 single / metro / list / invalid
 *   - writePipelineLeads：缺列时自动降级为旧列
 *
 * 验证根因（Vercel 504 超时）的修复：
 *   - sourceId 单源 → 只跑一源（不再一次跑 6 源）
 *   - metro=all → 仅返回源列表（不再同步执行全部）
 */

import { describe, it, expect, vi } from 'vitest';
import { decideImportMode } from '@/lib/pipeline/api-helpers';
import { writePipelineLeads } from '@/lib/pipeline/write-leads';
import type { PipelineLead } from '@/lib/pipeline/run';
import type { MetroArea } from '@/lib/sources/types';

const KNOWN_SOURCES = ['sf_gov', 'berkeley_open_data', 'houston_hdhhs', 'nyc_dohmh'];

const helpers = {
  enabledMetros: () =>
    ['sf_bay', 'houston', 'nyc'] as readonly MetroArea[],
  sourcesForMetro: (m: MetroArea) => {
    if (m === 'sf_bay') return [{ id: 'sf_gov' }, { id: 'berkeley_open_data' }];
    if (m === 'houston') return [{ id: 'houston_hdhhs' }];
    if (m === 'nyc') return [{ id: 'nyc_dohmh' }];
    return [];
  },
  enabledSourceIds: () => KNOWN_SOURCES,
  sourceExists: (id: string) => KNOWN_SOURCES.includes(id),
};

describe('decideImportMode', () => {
  it('sourceId routes to single mode', () => {
    const d = decideImportMode({ sourceId: 'nyc_dohmh' }, helpers);
    expect(d.mode).toBe('single');
    expect(d.sourceIds).toEqual(['nyc_dohmh']);
  });

  it('metro=all returns list mode with all source ids, does NOT pick any for execution', () => {
    const d = decideImportMode({ metro: 'all' }, helpers);
    expect(d.mode).toBe('list');
    expect(d.sourceIds).toEqual(KNOWN_SOURCES);
  });

  it('metro=specific routes to metro mode with that metro sources', () => {
    const d = decideImportMode({ metro: 'sf_bay' }, helpers);
    expect(d.mode).toBe('metro');
    expect(d.sourceIds).toEqual(['sf_gov', 'berkeley_open_data']);
    expect(d.metroLabel).toBe('sf_bay');
  });

  it('legacy region field still works (n8n backward compat)', () => {
    const d = decideImportMode({ region: 'houston' }, helpers);
    expect(d.mode).toBe('metro');
    expect(d.sourceIds).toEqual(['houston_hdhhs']);
  });

  it('unknown sourceId returns invalid', () => {
    const d = decideImportMode({ sourceId: 'mars_taco_data' }, helpers);
    expect(d.mode).toBe('invalid');
    expect(d.reason).toContain('mars_taco_data');
  });

  it('empty body falls back to sf_bay metro', () => {
    const d = decideImportMode({}, helpers);
    expect(d.mode).toBe('metro');
    expect(d.sourceIds).toEqual(['sf_gov', 'berkeley_open_data']);
  });

  it('unknown metro falls back to sf_bay (conservative default)', () => {
    const d = decideImportMode({ metro: 'mars' }, helpers);
    expect(d.mode).toBe('metro');
    expect(d.sourceIds).toEqual(['sf_gov', 'berkeley_open_data']);
  });

  it('sourceId takes precedence over metro', () => {
    const d = decideImportMode(
      { sourceId: 'nyc_dohmh', metro: 'sf_bay' },
      helpers,
    );
    expect(d.mode).toBe('single');
    expect(d.sourceIds).toEqual(['nyc_dohmh']);
  });
});

// ---------------------------------------------------------------------------
// writePipelineLeads —— Supabase 降级分支
// ---------------------------------------------------------------------------

function makeLead(overrides: Partial<PipelineLead> = {}): PipelineLead {
  return {
    external_id: 'ext-1',
    name: 'Test Cafe',
    address: '123 Main',
    phone: null,
    cuisine_type: '中餐',
    city: 'Test City',
    metro_area: 'sf_bay',
    source: 'sf_gov',
    license_date: '2026-04-01',
    first_inspection_date: null,
    license_type: null,
    source_raw: {},
    lead_status: 'new',
    lead_score: 70,
    is_restaurant_confidence: null,
    ai_classification: null,
    ...overrides,
  };
}

describe('writePipelineLeads', () => {
  it('happy path: upserts with (source, external_id) conflict key, ignoreDuplicates=true', async () => {
    const upsert = vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: [{ id: 'uuid-1' }, { id: 'uuid-2' }], error: null }),
    });
    const supa = {
      from: vi.fn(() => ({ upsert })),
    } as unknown as Parameters<typeof writePipelineLeads>[0];

    const res = await writePipelineLeads(supa, [makeLead(), makeLead({ external_id: 'ext-2' })]);

    expect(res.imported).toBe(2);
    expect(res.degraded).toBe(false);
    expect(upsert).toHaveBeenCalledTimes(1);
    // 锁住：onConflict + ignoreDuplicates 配置
    expect(upsert).toHaveBeenCalledWith(
      expect.any(Array),
      { onConflict: 'source,external_id', ignoreDuplicates: true },
    );
  });

  it('CRITICAL: when upsert reports missing column, degrades to legacy columns + per-row insert', async () => {
    // 模拟 Supabase 返回 "column 'external_id' does not exist" 错误
    const missingColErr = { code: '42703', message: 'column "external_id" does not exist' };

    // 初次 upsert 返回错误
    const upsert = vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: null, error: missingColErr }),
    });

    // 降级路径：对每行 select().maybeSingle() 判断是否存在，不存在则 insert
    const maybeSingleFn = vi.fn().mockResolvedValue({ data: null, error: null });
    const ilikeFn = vi.fn(() => ({ maybeSingle: maybeSingleFn }));
    const eqCity = vi.fn(() => ({ ilike: ilikeFn }));
    const eqName = vi.fn(() => ({ eq: eqCity }));
    const selectExists = vi.fn(() => ({ eq: eqName }));

    const insertCall = vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: [{ id: 'new-uuid' }], error: null }),
    });

    let callCount = 0;
    const supa = {
      from: vi.fn(() => {
        callCount += 1;
        if (callCount === 1) {
          // 首次：upsert 失败
          return { upsert };
        }
        // 之后：降级分支 select + insert 交替
        return {
          select: selectExists,
          insert: insertCall,
        };
      }),
    } as unknown as Parameters<typeof writePipelineLeads>[0];

    const res = await writePipelineLeads(supa, [makeLead()]);

    expect(res.degraded).toBe(true);
    expect(res.schemaHint).toContain('migration');
    expect(res.imported).toBe(1);
    // 插入的 payload 不能包含新列
    const insertedPayload = insertCall.mock.calls[0][0] as Record<string, unknown>;
    expect(insertedPayload).not.toHaveProperty('metro_area');
    expect(insertedPayload).not.toHaveProperty('external_id');
    expect(insertedPayload).not.toHaveProperty('first_inspection_date');
    expect(insertedPayload).not.toHaveProperty('is_restaurant_confidence');
    expect(insertedPayload).not.toHaveProperty('ai_classification');
    // 老列必须保留
    expect(insertedPayload).toHaveProperty('name', 'Test Cafe');
    expect(insertedPayload).toHaveProperty('source', 'sf_gov');
    expect(insertedPayload).toHaveProperty('lead_score', 70);
  });

  it('non-schema error re-throws (真·故障不静默吞掉)', async () => {
    const upsert = vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue({
        data: null,
        error: { code: '23505', message: 'duplicate key value violates unique constraint' },
      }),
    });
    const supa = { from: vi.fn(() => ({ upsert })) } as unknown as Parameters<typeof writePipelineLeads>[0];

    await expect(writePipelineLeads(supa, [makeLead()])).rejects.toThrow(/duplicate key/);
  });

  it('empty input returns zero without touching supabase', async () => {
    const supa = { from: vi.fn() } as unknown as Parameters<typeof writePipelineLeads>[0];
    const res = await writePipelineLeads(supa, []);
    expect(res.imported).toBe(0);
    expect(res.degraded).toBe(false);
    expect(supa.from).not.toHaveBeenCalled();
  });

  it('lead without external_id goes through per-row insert (not upsert)', async () => {
    // 这类 payload 走 (name, city, address) 软去重
    const maybeSingleFn = vi.fn().mockResolvedValue({ data: null, error: null });
    const ilikeFn = vi.fn(() => ({ maybeSingle: maybeSingleFn }));
    const eqCity = vi.fn(() => ({ ilike: ilikeFn }));
    const eqName = vi.fn(() => ({ eq: eqCity }));
    const selectExists = vi.fn(() => ({ eq: eqName }));
    const insertCall = vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: [{ id: 'u1' }], error: null }),
    });

    const supa = {
      from: vi.fn(() => ({
        select: selectExists,
        insert: insertCall,
      })),
    } as unknown as Parameters<typeof writePipelineLeads>[0];

    const res = await writePipelineLeads(supa, [makeLead({ external_id: null })]);
    expect(res.imported).toBe(1);
    expect(insertCall).toHaveBeenCalledTimes(1);
  });
});
