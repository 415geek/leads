/**
 * Seattle / LA / Boston adapters —— 骨架测试
 *
 * 这三个源默认 enabled=false（待核实 Socrata/CKAN resource id 和字段名）。
 * 测试验证 normalize 函数对典型 schema 行为正确 —— fixture 以门户公开字段命名为准。
 * 上线前需：
 *   1. 访问对应数据门户，核实 resource id 与字段列（尤其是 inspection_date 字段名）
 *   2. 调整 normalizeRow 以及 fetchAndNormalize 的 where 子句
 *   3. 把 enabled 改为 true
 */

import { describe, it, expect } from 'vitest';
import { _seattleNormalizeRowForTests, seattleSource } from '@/lib/sources/seattle';
import { _laNormalizeRowForTests, losAngelesSource } from '@/lib/sources/los-angeles';
import { _bostonNormalizeRowForTests, bostonSource } from '@/lib/sources/boston';

describe('Seattle (King County) adapter', () => {
  it('extracts program_identifier as external_id', () => {
    const d = _seattleNormalizeRowForTests({
      name: 'Pike Place Chowder',
      address: '1530 Post Alley',
      city: 'Seattle',
      program_identifier: 'PR0123456',
      inspection_date: '2026-03-10',
    });
    expect(d!.external_id).toBe('PR0123456');
    expect(d!.metro_area).toBe('seattle');
    expect(d!.source).toBe('king_county_food');
  });

  it('default city is Seattle when missing', () => {
    const d = _seattleNormalizeRowForTests({
      name: 'Test Cafe',
      inspection_date: '2026-03-01',
    });
    expect(d!.city).toBe('Seattle');
  });

  it('is gated behind enabled=false until resource id is verified', () => {
    expect(seattleSource.enabled).toBe(false);
  });
});

describe('LA County DPH adapter', () => {
  it('uses pe_number as external_id, activity_date as inspection', () => {
    const d = _laNormalizeRowForTests({
      facility_name: 'Tacos El Gavilan',
      facility_address: '4309 Whittier Blvd',
      facility_city: 'Los Angeles',
      pe_number: 'PE12345',
      activity_date: '2026-03-12',
      program_name: 'RESTAURANT (0-30) SEATS LOW RISK',
    });
    expect(d!.external_id).toBe('PE12345');
    expect(d!.license_date).toBe('2026-03-12');
    expect(d!.metro_area).toBe('la');
    expect(d!.license_type).toContain('RESTAURANT');
  });

  it('falls back to inspection_date when activity_date missing', () => {
    const d = _laNormalizeRowForTests({
      facility_name: 'Test Restaurant',
      inspection_date: '2026-03-01',
    });
    expect(d!.license_date).toBe('2026-03-01');
  });

  it('is gated behind enabled=false until resource id is verified', () => {
    expect(losAngelesSource.enabled).toBe(false);
  });
});

describe('Boston Food Establishment adapter (CKAN)', () => {
  it('uses licenseno as external_id, inspdttm as date', () => {
    const d = _bostonNormalizeRowForTests({
      businessname: 'Union Oyster House',
      address: '41 Union St',
      city: 'Boston',
      licenseno: 'LIC-789',
      inspdttm: '2026-03-08',
    });
    expect(d!.external_id).toBe('LIC-789');
    expect(d!.metro_area).toBe('boston');
    expect(d!.source).toBe('boston_food_inspect');
  });

  it('returns null when businessname missing', () => {
    const d = _bostonNormalizeRowForTests({ address: '1 Test' });
    expect(d).toBeNull();
  });

  it('is gated behind enabled=false until resource id is verified', () => {
    expect(bostonSource.enabled).toBe(false);
  });
});
