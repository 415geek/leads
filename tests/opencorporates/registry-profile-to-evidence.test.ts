import { describe, expect, it } from 'vitest';
import { webRegistryProfileToEvidenceRows } from '@/lib/opencorporates/registry-profile-to-evidence';
import type { WebRegistryProfile } from '@/lib/opencorporates/web-registry-profile';

describe('webRegistryProfileToEvidenceRows', () => {
  it('maps Tavily/OpenCorporates web profile to registry evidence fields', () => {
    const profile: WebRegistryProfile = {
      entityName: 'Celadon Table LLC',
      companyNumber: 'B20260193867',
      status: 'Active',
      incorporationDate: '23 April 2026',
      companyType: 'Limited Liability Company - CA',
      jurisdiction: 'California (US)',
      registeredAddress: '3195 24TH ST\nSAN FRANCISCO\n94110\nCA\nUnited States',
      agentName: 'TOVANNAI NATASHA BONSHEA KELLY',
      agentAddress: '3195 24TH ST, SAN FRANCISCO, CA, 94110, UNITED STATES',
      directorsOfficers: 'TOVANNAI NATASHA BONSHEA KELLY, agent',
      officers: [{ name: 'TOVANNAI NATASHA BONSHEA KELLY', position: 'agent' }],
      registryUrl: 'https://opencorporates.com/companies/us_ca/B20260193867',
      snippetsUsed: 3,
      via: 'ai',
    };

    const rows = webRegistryProfileToEvidenceRows('lid', profile);
    const byField = Object.fromEntries(rows.map((r) => [r.field, r]));

    expect(rows.every((r) => r.source === 'opencorporates')).toBe(true);
    expect(byField.entity_number?.value).toBe('B20260193867');
    expect(byField.entity_status?.value).toBe('Active');
    expect(byField.filing_date?.value).toBe('23 April 2026');
    expect(byField.officer_role?.value).toBe('TOVANNAI NATASHA BONSHEA KELLY, agent');
  });
});
