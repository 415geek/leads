import { describe, expect, it } from 'vitest';
import {
  caSosEntityToEvidenceRows,
  formatCaSosFilingDate,
} from '@/lib/ca-sos/entity-to-evidence';

describe('caSosEntityToEvidenceRows', () => {
  it('formats filing date for evidence display', () => {
    expect(formatCaSosFilingDate('2026-04-23T00:00:00')).toMatch(/23 April 2026/);
  });

  it('maps all registry fields from entity', () => {
    const rows = caSosEntityToEvidenceRows('lid', {
      EntityID: 'B20260193867',
      EntityName: 'Celadon Table LLC',
      EntityType: 'Limited Liability Company - CA',
      FilingDate: '2026-04-23T09:00:00',
      StatusDescription: 'Active',
      EntityStreetAddress1: '3195 24TH ST',
      EntityCity: 'SAN FRANCISCO',
      EntityState: 'CA',
      EntityZipCode: '94110',
      AgentName: 'TOVANNAI NATASHA BONSHEA KELLY',
      AgentAddress1: '3195 24TH ST',
      AgentCity: 'SAN FRANCISCO',
      AgentState: 'CA',
      AgentZipCode: '94110',
    });

    const fields = new Set(rows.map((r) => r.field));
    expect(fields).toContain('entity_number');
    expect(fields).toContain('entity_status');
    expect(fields).toContain('filing_date');
    expect(fields).toContain('agent_name');
    expect(fields).toContain('owner_name');
    const officerRow = rows.find((r) => r.field === 'officer_role');
    expect(officerRow?.value).toBe('TOVANNAI NATASHA BONSHEA KELLY, agent');
    const addr = rows.find((r) => r.field === 'registered_address');
    expect(addr?.value).toContain('3195 24TH ST');
    expect(addr?.value).toContain('\n');
  });
});
