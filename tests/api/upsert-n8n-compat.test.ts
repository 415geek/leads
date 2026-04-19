/**
 * REGRESSION TEST: n8n webhook 向后兼容
 *
 * 场景：现有 n8n 工作流发到 /api/leads/upsert 的 payload shape 可能：
 *   1. 没有 external_id（旧数据源没抓）
 *   2. 没有 metro_area（旧字段未补）
 *   3. 有 region 字段（旧 UI 发的）
 *   4. source 是 'sf_gov' / 'houston_hdhhs' / 'berkeley_open_data'（registry 注册的 id）
 *
 * 这个测试锁定：
 *   - getSourceById 能认出 n8n 发的所有 source id，并回填 metro
 *   - 旧 payload 不带 external_id 时仍可被 dedupe 处理（按 name+address+city）
 *   - parseMetroInput 兼容 region 旧字段
 *
 * 不连真实数据库，只测可测 helper。数据库行为由 tests/schema-migration.test.ts 锁定
 * （onConflict 'source,external_id' 对应 idx_leads_source_external 部分唯一索引）。
 */

import { describe, it, expect } from 'vitest';
import { getSourceById, enabledMetros } from '@/lib/sources/registry';
import { parseMetroInput } from '@/lib/pipeline/api-helpers';
import { dedupePipelineLeads } from '@/lib/pipeline/dedupe';
import type { PipelineLead } from '@/lib/pipeline/run';

describe('n8n webhook backward compatibility', () => {
  it('recognizes all legacy source ids registered in the registry', () => {
    // 这些 id 是 n8n 工作流已经在发的，改名会破坏线上流量 —— 锁死
    expect(getSourceById('sf_gov')?.metro).toBe('sf_bay');
    expect(getSourceById('berkeley_open_data')?.metro).toBe('sf_bay');
    expect(getSourceById('houston_hdhhs')?.metro).toBe('houston');
  });

  it('parseMetroInput accepts legacy `region` field from old n8n payloads', () => {
    const enabled = enabledMetros();
    // 老 UI/n8n 会发 { region: 'sf_bay', leads: [...] }
    expect(parseMetroInput({ region: 'sf_bay' }, enabled)).toBe('sf_bay');
    expect(parseMetroInput({ region: 'houston' }, enabled)).toBe('houston');
  });

  it('dedupe tolerates legacy payloads without external_id', () => {
    const legacyLead: PipelineLead = {
      external_id: null,
      name: 'Legacy Cafe',
      address: '10 Market St',
      phone: '415-555-0000',
      cuisine_type: '中餐',
      city: 'San Francisco',
      metro_area: 'sf_bay',
      source: 'sf_gov',
      license_date: '2026-04-01',
      first_inspection_date: null,
      license_type: 'Restaurant',
      source_raw: {},
      lead_status: 'new',
      lead_score: 75,
      is_restaurant_confidence: null,
      ai_classification: null,
    };

    // 同 (name, address, city) 重复应去重
    const out = dedupePipelineLeads([legacyLead, { ...legacyLead, phone: '415-555-9999' }]);
    expect(out).toHaveLength(1);
    // 保留第一个（phone 为 415-555-0000），避免后到者覆盖有效数据
    expect(out[0].phone).toBe('415-555-0000');
  });

  it('dedupe does NOT cross-dedupe between old (no external_id) and new (with external_id) rows', () => {
    // 同一条店如果先由 n8n 无 external_id 发过，又由 pipeline 带 external_id 发一次，
    // 这两条因为 dedupe key 不同会被视为不同行 —— 这是预期行为，由数据库层的
    // idx_leads_name_address_city_lower 部分索引在 external_id IS NULL 时兜底去重。
    const legacy: PipelineLead = {
      external_id: null,
      name: 'Twin Dragons',
      address: '55 Grant Ave',
      phone: null,
      cuisine_type: '中餐',
      city: 'San Francisco',
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
    };
    const pipeline: PipelineLead = { ...legacy, external_id: 'sf-uniq-999' };

    const out = dedupePipelineLeads([legacy, pipeline]);
    // 内存 dedupe 会保留 2 条（不同 key）；数据库部分索引兜底
    expect(out).toHaveLength(2);
  });

  it('legacy n8n payload with wrong source id falls through to null metro (must not crash)', () => {
    expect(getSourceById('totally_unknown')).toBeUndefined();
  });
});
