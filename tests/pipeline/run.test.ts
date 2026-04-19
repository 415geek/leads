/**
 * Pipeline runPipeline 端到端测试（不接真实外部 API）
 *
 * 验证：
 *   1. Phase 1 pass-through 行为：classify / enrich 不存在时 lead 全部入库、confidence=null、enrichment=null
 *   2. skipClassify / skipEnrich 标志生效
 *   3. score 逻辑与单测一致
 *   4. 源未在 registry 时被跳过
 *
 * 我们通过 monkey-patch registry 里的真实 source 的 fetchAndNormalize 来注入 mock drafts，
 * 避免动网络；测试完必须还原。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { runPipeline } from '@/lib/pipeline/run';
import { sanFranciscoSource } from '@/lib/sources/san-francisco';
import { houstonSource } from '@/lib/sources/houston';
import { berkeleySource } from '@/lib/sources/berkeley';
import type { NormalizedDraft } from '@/lib/sources/types';

function sfDraft(overrides: Partial<NormalizedDraft> = {}): NormalizedDraft {
  return {
    external_id: 'sf-uniq-1',
    name: 'Golden Dragon Dim Sum',
    address: '123 Grant Ave, San Francisco, CA',
    phone: '415-555-9999',
    cuisine_type: '中餐',
    city: 'San Francisco',
    metro_area: 'sf_bay',
    source: 'sf_gov',
    license_date: new Date().toISOString().split('T')[0],
    first_inspection_date: null,
    license_type: 'Restaurant',
    source_raw: { uniqueid: 'sf-uniq-1' },
    lead_status: 'new',
    ...overrides,
  };
}

function houstonDraft(overrides: Partial<NormalizedDraft> = {}): NormalizedDraft {
  return {
    external_id: 'hou_123',
    name: 'BBQ Palace',
    address: '45 Main St, Houston, TX',
    phone: null,
    cuisine_type: '餐饮',
    city: 'Houston',
    metro_area: 'houston',
    source: 'houston_hdhhs',
    license_date: '2026-04-01',
    first_inspection_date: '2026-04-01',
    license_type: 'Restaurant',
    source_raw: {},
    lead_status: 'new',
    ...overrides,
  };
}

describe('runPipeline', () => {
  let sfSpy: ReturnType<typeof vi.spyOn>;
  let huSpy: ReturnType<typeof vi.spyOn>;
  let brkSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    sfSpy = vi.spyOn(sanFranciscoSource, 'fetchAndNormalize');
    huSpy = vi.spyOn(houstonSource, 'fetchAndNormalize');
    brkSpy = vi.spyOn(berkeleySource, 'fetchAndNormalize');
  });

  afterEach(() => {
    sfSpy.mockRestore();
    huSpy.mockRestore();
    brkSpy.mockRestore();
  });

  it('Phase 1 pass-through: no classifier, no enricher; all drafts become leads', async () => {
    sfSpy.mockResolvedValue({
      result: { id: 'sf_gov', label: 'sf', ok: true, fetched: 2 },
      drafts: [sfDraft({ external_id: 'a' }), sfDraft({ external_id: 'b', name: 'Cafe Two' })],
    });
    brkSpy.mockResolvedValue({
      result: { id: 'berkeley_open_data', label: 'bk', ok: true, fetched: 0 },
      drafts: [],
    });
    huSpy.mockResolvedValue({
      result: { id: 'houston_hdhhs', label: 'hou', ok: true, fetched: 0 },
      drafts: [],
    });

    const res = await runPipeline({ sourceIds: ['sf_gov', 'berkeley_open_data', 'houston_hdhhs'] });
    expect(res.leads).toHaveLength(2);
    expect(res.droppedNonRestaurant).toBe(0);
    expect(res.enrichmentCalls).toBe(0);
    // Phase 1 pass-through: confidence=null，ai_classification=null
    expect(res.leads[0].is_restaurant_confidence).toBeNull();
    expect(res.leads[0].ai_classification).toBeNull();
  });

  it('scores drafts and populates metro-specific scores', async () => {
    sfSpy.mockResolvedValue({
      result: { id: 'sf_gov', label: 'sf', ok: true, fetched: 1 },
      drafts: [sfDraft()],
    });
    brkSpy.mockResolvedValue({
      result: { id: 'berkeley_open_data', label: 'bk', ok: true, fetched: 0 },
      drafts: [],
    });
    huSpy.mockResolvedValue({
      result: { id: 'houston_hdhhs', label: 'hou', ok: true, fetched: 1 },
      drafts: [houstonDraft()],
    });

    const res = await runPipeline({ sourceIds: ['sf_gov', 'berkeley_open_data', 'houston_hdhhs'] });
    expect(res.leads).toHaveLength(2);
    const sf = res.leads.find((l) => l.source === 'sf_gov');
    const hu = res.leads.find((l) => l.source === 'houston_hdhhs');
    expect(sf!.lead_score).toBeGreaterThan(0);
    expect(hu!.lead_score).toBeGreaterThan(0);
    // sf 有电话 + 都会权重 1.0；houston 无电话 + 权重 0.67 —— sf 应该分更高
    expect(sf!.lead_score).toBeGreaterThan(hu!.lead_score);
  });

  it('sourceIds filter narrows to only requested sources', async () => {
    sfSpy.mockResolvedValue({
      result: { id: 'sf_gov', label: 'sf', ok: true, fetched: 1 },
      drafts: [sfDraft()],
    });
    brkSpy.mockResolvedValue({
      result: { id: 'berkeley_open_data', label: 'bk', ok: true, fetched: 0 },
      drafts: [],
    });

    await runPipeline({ sourceIds: ['sf_gov'] });

    expect(sfSpy).toHaveBeenCalledTimes(1);
    expect(brkSpy).not.toHaveBeenCalled();
    expect(huSpy).not.toHaveBeenCalled();
  });

  it('singleSourceId runs exactly one source (import-timeout fix)', async () => {
    sfSpy.mockResolvedValue({
      result: { id: 'sf_gov', label: 'sf', ok: true, fetched: 0 },
      drafts: [],
    });
    huSpy.mockResolvedValue({
      result: { id: 'houston_hdhhs', label: 'hou', ok: true, fetched: 1 },
      drafts: [houstonDraft()],
    });
    brkSpy.mockResolvedValue({
      result: { id: 'berkeley_open_data', label: 'bk', ok: true, fetched: 0 },
      drafts: [],
    });

    const res = await runPipeline({ singleSourceId: 'houston_hdhhs' });

    // Only houston should have been called
    expect(huSpy).toHaveBeenCalledTimes(1);
    expect(sfSpy).not.toHaveBeenCalled();
    expect(brkSpy).not.toHaveBeenCalled();
    expect(res.leads).toHaveLength(1);
    expect(res.leads[0].source).toBe('houston_hdhhs');
  });

  it('skipClassify=true bypasses classifier (default for interactive import)', async () => {
    sfSpy.mockResolvedValue({
      result: { id: 'sf_gov', label: 'sf', ok: true, fetched: 1 },
      drafts: [sfDraft()],
    });
    brkSpy.mockResolvedValue({
      result: { id: 'berkeley_open_data', label: 'bk', ok: true, fetched: 0 },
      drafts: [],
    });

    const res = await runPipeline({ singleSourceId: 'sf_gov', skipClassify: true });

    expect(res.leads).toHaveLength(1);
    // confidence is null when classify is skipped
    expect(res.leads[0].is_restaurant_confidence).toBeNull();
    // dropped stays 0 because we don't classify
    expect(res.droppedNonRestaurant).toBe(0);
  });

  it('isolates failure: one source throws, other source still yields leads', async () => {
    sfSpy.mockRejectedValue(new Error('SF exploded'));
    brkSpy.mockResolvedValue({
      result: { id: 'berkeley_open_data', label: 'bk', ok: true, fetched: 1 },
      drafts: [
        sfDraft({
          external_id: 'brk-1',
          source: 'berkeley_open_data',
          name: 'Berk Cafe',
        }),
      ],
    });
    huSpy.mockResolvedValue({
      result: { id: 'houston_hdhhs', label: 'hou', ok: true, fetched: 0 },
      drafts: [],
    });

    const res = await runPipeline({ sourceIds: ['sf_gov', 'berkeley_open_data', 'houston_hdhhs'] });
    expect(res.leads).toHaveLength(1);
    const sfResult = res.sourceResults.find((r) => r.id === 'sf_gov');
    expect(sfResult?.ok).toBe(false);
    expect(sfResult?.error).toContain('SF exploded');
  });
});
