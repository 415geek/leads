/**
 * Seattle / LA / Boston adapters —— 骨架测试
 *
 * LA：已切换为 LA County ArcGIS FeatureServer（现行季度数据）；normalize 以字段名为准。
 * Seattle / Boston 仍默认 enabled=false（待核实 resource）。
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

describe('LA County EH (ArcGIS) adapter', () => {
  it('uses FACILITY_ID as external_id and ACTIVITY_DATE epoch as inspection', () => {
    const ms = new Date('2026-03-12T00:00:00.000Z').getTime();
    const d = _laNormalizeRowForTests({
      FACILITY_NAME: 'Tacos El Gavilan',
      FACILITY_ADDRESS: '4309 Whittier Blvd',
      FACILITY_CITY: 'LOS ANGELES',
      FACILITY_STATE: 'CA',
      FACILITY_ZIP: '90023',
      FACILITY_ID: 'FA12345',
      ACTIVITY_DATE: ms,
      PE_DESCRIPTION: 'RESTAURANT (0-30) SEATS LOW RISK',
      PROGRAM_NAME: 'TACOS EL GAVILAN',
    });
    expect(d!.external_id).toBe('FA12345');
    expect(d!.license_date).toBe('2026-03-12');
    expect(d!.metro_area).toBe('la');
    expect(d!.source).toBe('lacounty_restaurant_inspect');
    expect(d!.license_type).toContain('RESTAURANT');
  });

  it('is enabled with live ArcGIS backing', () => {
    expect(losAngelesSource.enabled).toBe(true);
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
