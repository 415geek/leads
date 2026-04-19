import { describe, it, expect } from 'vitest';
import { parseMetroInput, CHINESE_TAGS } from '@/lib/pipeline/api-helpers';
import { dedupePipelineLeads } from '@/lib/pipeline/dedupe';
import type { PipelineLead } from '@/lib/pipeline/run';
import type { MetroArea } from '@/lib/sources/types';

const ENABLED: MetroArea[] = ['sf_bay', 'houston'];

describe('parseMetroInput', () => {
  it('accepts new metro field', () => {
    expect(parseMetroInput({ metro: 'sf_bay' }, ENABLED)).toBe('sf_bay');
    expect(parseMetroInput({ metro: 'houston' }, ENABLED)).toBe('houston');
  });

  it('accepts legacy region field', () => {
    expect(parseMetroInput({ region: 'sf_bay' }, ENABLED)).toBe('sf_bay');
    expect(parseMetroInput({ region: 'houston' }, ENABLED)).toBe('houston');
  });

  it('rejects unknown metro', () => {
    expect(parseMetroInput({ metro: 'nyc' }, ENABLED)).toBeNull();
    expect(parseMetroInput({ region: 'mars' }, ENABLED)).toBeNull();
  });

  it('returns null for non-object body', () => {
    expect(parseMetroInput(null, ENABLED)).toBeNull();
    expect(parseMetroInput('sf_bay', ENABLED)).toBeNull();
    expect(parseMetroInput(42, ENABLED)).toBeNull();
  });

  it('returns null for empty body', () => {
    expect(parseMetroInput({}, ENABLED)).toBeNull();
  });

  it('prefers metro over region when both present', () => {
    expect(parseMetroInput({ metro: 'sf_bay', region: 'houston' }, ENABLED)).toBe('sf_bay');
  });
});

describe('CHINESE_TAGS', () => {
  it('includes the 6 canonical Chinese cuisine tags', () => {
    expect(CHINESE_TAGS).toEqual(['中餐', '川菜', '粤菜', '湘菜', '台湾菜', '东北菜']);
  });

  it('is typed as readonly string[] so .includes works with any string', () => {
    const arbitraryString: string = '川菜';
    expect(CHINESE_TAGS.includes(arbitraryString)).toBe(true);
    expect(CHINESE_TAGS.includes('Italian')).toBe(false);
  });
});

describe('dedupePipelineLeads', () => {
  function makeLead(overrides: Partial<PipelineLead> = {}): PipelineLead {
    return {
      external_id: null,
      name: 'Test',
      address: '123 Main',
      phone: null,
      cuisine_type: '餐饮',
      city: 'SF',
      metro_area: 'sf_bay',
      source: 'sf_gov',
      license_date: null,
      first_inspection_date: null,
      license_type: null,
      source_raw: {},
      lead_status: 'new',
      lead_score: 50,
      is_restaurant_confidence: null,
      ai_classification: null,
      ...overrides,
    };
  }

  it('dedupes by (source, external_id) when external_id present', () => {
    const a = makeLead({ external_id: 'x1', name: 'A' });
    const b = makeLead({ external_id: 'x1', name: 'A-dup' }); // 同 external_id
    const c = makeLead({ external_id: 'x2', name: 'C' });
    const out = dedupePipelineLeads([a, b, c]);
    expect(out).toHaveLength(2);
    expect(out[0].name).toBe('A'); // 先来的保留
  });

  it('dedupes by (name, address, city) when external_id is null (n8n back-compat)', () => {
    const a = makeLead({ external_id: null, name: 'Golden Dragon', address: '1 St', city: 'SF' });
    const b = makeLead({ external_id: null, name: 'Golden Dragon', address: '1 ST', city: 'sf' }); // 大小写差异
    const c = makeLead({ external_id: null, name: 'Other', address: '2 St', city: 'SF' });
    const out = dedupePipelineLeads([a, b, c]);
    expect(out).toHaveLength(2);
  });

  it('different sources with same external_id are NOT deduped (cross-city collision guard)', () => {
    // 跨城市同名同 external_id 不合并（例如两个城市的 permit 数据集内 ID 重名）
    const sf = makeLead({ external_id: '1001', source: 'sf_gov' });
    const houston = makeLead({ external_id: '1001', source: 'houston_hdhhs' });
    const out = dedupePipelineLeads([sf, houston]);
    expect(out).toHaveLength(2);
  });

  it('handles empty input', () => {
    expect(dedupePipelineLeads([])).toEqual([]);
  });
});
