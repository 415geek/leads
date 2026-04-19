import { describe, it, expect } from 'vitest';
import {
  computeDatasfNewOpeningIntel,
  indexClosedRecordsByBaseAddress,
  isDatasfActiveLocationRow,
  matchDatasfTransfer,
  mergeOpeningSignals,
  normalizeAddressForDatasf,
  normalizeOrgName,
  normalizedBaseAddressKey,
} from '@/lib/datasf-opening-intel';

function iso(d: Date): string {
  return d.toISOString().split('T')[0];
}

describe('datasf-opening-intel', () => {
  it('normalizeAddressForDatasf uppercases and abbreviates street types', () => {
    expect(normalizeAddressForDatasf('100 Main Street, San Francisco')).toContain('100 MAIN ST');
  });

  it('normalizedBaseAddressKey strips suite tokens', () => {
    const a = normalizedBaseAddressKey('100 Main St Ste 200');
    const b = normalizedBaseAddressKey('100 Main St');
    expect(a).toBe(b);
  });

  it('normalizeOrgName strips legal suffixes', () => {
    expect(normalizeOrgName('Foo Bar LLC')).toBe('FOO BAR');
  });

  it('isDatasfActiveLocationRow rejects ended or administratively closed', () => {
    expect(isDatasfActiveLocationRow({ location_end_date: '2024-01-01' })).toBe(false);
    expect(isDatasfActiveLocationRow({ dba_end_date: '2024-01-01' })).toBe(false);
    expect(
      isDatasfActiveLocationRow({ administratively_closed: '***Administratively Closed' }),
    ).toBe(false);
    expect(isDatasfActiveLocationRow({ location_start_date: '2026-01-01' })).toBe(true);
  });

  it('computeDatasfNewOpeningIntel scores recent location_start + active + food', () => {
    const ref = new Date('2026-04-19T12:00:00Z');
    const row = {
      location_start_date: '2026-04-10T00:00:00.000',
      dba_start_date: '2026-04-10T00:00:00.000',
      full_business_address: '1 Test St',
      naic_code_description: 'Food Services',
      lic_code_description: 'RESTAURANT',
      dba_name: 'Golden Wok',
    };
    const intel = computeDatasfNewOpeningIntel(row, ref, { newOpeningWindowDays: 90 });
    expect(intel.new_opening_score).toBeGreaterThanOrEqual(60);
    expect(intel.reason_codes).toContain('RECENT_LOCATION_START');
    expect(intel.reason_codes).toContain('ACTIVE_RECORD');
    expect(intel.is_new_at_location).toBe(true);
  });

  it('matchDatasfTransfer finds prior closed at same base address within window', () => {
    const ref = new Date('2026-04-19T12:00:00Z');
    const active = {
      location_start_date: '2026-03-15T00:00:00.000',
      full_business_address: '500 Mission St',
      ownership_name: 'New Owner Inc',
      certificate_number: '2222222',
      dba_name: 'New DBA',
      naic_code_description: 'Food Services',
      lic_code_description: 'RESTAURANT',
    };
    const closedRow = {
      location_end_date: '2026-03-01T00:00:00.000',
      full_business_address: '500 Mission St',
      ownership_name: 'Old Owner LLC',
      certificate_number: '1111111',
      dba_name: 'Old DBA',
      naic_code_description: 'Food Services',
      lic_code_description: 'RESTAURANT',
    };
    const idx = indexClosedRecordsByBaseAddress([closedRow]);
    const key = normalizedBaseAddressKey('500 Mission St');
    const priors = idx.get(key) ?? [];
    const t = matchDatasfTransfer(active, priors, ref, { transferWindowDays: 120 });
    expect(t.matched_prior).toBe(true);
    expect(t.transfer_score).toBeGreaterThan(40);
    expect(t.reason_codes).toContain('BUSINESS_ACCOUNT_CHANGED');
  });

  it('mergeOpeningSignals combines reason codes and sets manual_review_priority', () => {
    const ref = new Date('2026-04-19T12:00:00Z');
    const base = computeDatasfNewOpeningIntel(
      {
        location_start_date: iso(ref),
        full_business_address: '1 X St',
        naic_code_description: 'Food Services',
      },
      ref,
    );
    const transfer = matchDatasfTransfer(
      {
        location_start_date: iso(ref),
        full_business_address: '1 X St',
        ownership_name: 'A',
        certificate_number: '1',
        dba_name: 'B',
        naic_code_description: 'Food Services',
      },
      [],
      ref,
    );
    const m = mergeOpeningSignals(base, transfer);
    expect(m.new_opening_label).toBeDefined();
    expect(m.transfer_label).toBe('none');
  });
});
