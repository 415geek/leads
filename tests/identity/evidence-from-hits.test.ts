import { describe, expect, it } from 'vitest';
import { hitsToEvidence } from '@/lib/identity/evidence-from-hits';
import type { IdentityNameHit } from '@/lib/identity/types';

describe('hitsToEvidence', () => {
  it('expands CA SOS entity into full registry evidence rows', () => {
    const hits: IdentityNameHit[] = [
      {
        source: 'business_license',
        entityName: 'Celadon Table LLC',
        personName: null,
        confidenceRaw: 0.9,
        rawPayload: { from: 'ownership_name' },
      },
      {
        source: 'ca_sos',
        entityName: 'Celadon Table LLC',
        personName: 'TOVANNAI NATASHA BONSHEA KELLY',
        confidenceRaw: 0.86,
        rawPayload: {
          lookup: 'ca_sos_api',
          ca_sos_entity: {
            EntityID: 'B20260193867',
            EntityName: 'Celadon Table LLC',
            EntityType: 'Limited Liability Company - CA',
            FilingDate: '2026-04-23T00:00:00',
            StatusDescription: 'Active',
            Jurisdiction: 'CALIFORNIA',
            EntityStreetAddress1: '3195 24TH ST',
            EntityCity: 'SAN FRANCISCO',
            EntityState: 'CA',
            EntityZipCode: '94110',
            AgentName: 'TOVANNAI NATASHA BONSHEA KELLY',
            AgentAddress1: '3195 24TH ST',
            AgentCity: 'SAN FRANCISCO',
            AgentState: 'CA',
            AgentZipCode: '94110',
          },
        },
      },
    ];

    const rows = hitsToEvidence('lead-1', hits);
    const byField = Object.fromEntries(rows.map((r) => [r.field, r]));

    expect(byField.owner_entity?.source).toBe('ca_sos');
    expect(byField.entity_number?.value).toBe('B20260193867');
    expect(byField.entity_status?.value).toBe('Active');
    expect(byField.entity_type?.value).toBe('Limited Liability Company - CA');
    expect(byField.jurisdiction?.value).toBe('California (US)');
    expect(byField.registered_address?.value).toContain('3195 24TH ST');
    expect(byField.agent_name?.value).toBe('TOVANNAI NATASHA BONSHEA KELLY');
    expect(byField.owner_name?.value).toBe('TOVANNAI NATASHA BONSHEA KELLY');
    expect(byField.officer_role?.value).toBe('TOVANNAI NATASHA BONSHEA KELLY, agent');

    expect(rows.filter((r) => r.source === 'business_license')).toHaveLength(1);
    expect(rows.filter((r) => r.source === 'ca_sos').length).toBeGreaterThanOrEqual(8);
  });

  it('expands OpenCorporates web registry profile into evidence rows', () => {
    const hits: IdentityNameHit[] = [
      {
        source: 'opencorporates',
        entityName: 'Celadon Table LLC',
        personName: 'TOVANNAI NATASHA BONSHEA KELLY',
        confidenceRaw: 0.72,
        rawPayload: {
          lookup: 'web_search',
          oc_web_registry: {
            entityName: 'Celadon Table LLC',
            companyNumber: 'B20260193867',
            status: 'Active',
            incorporationDate: '23 April 2026',
            companyType: 'Limited Liability Company - CA',
            jurisdiction: 'California (US)',
            registeredAddress: '3195 24TH ST\nSAN FRANCISCO',
            agentName: 'TOVANNAI NATASHA BONSHEA KELLY',
            agentAddress: '3195 24TH ST, SAN FRANCISCO, CA',
            directorsOfficers: 'TOVANNAI NATASHA BONSHEA KELLY, agent',
            officers: [{ name: 'TOVANNAI NATASHA BONSHEA KELLY', position: 'agent' }],
            registryUrl: 'https://opencorporates.com/companies/us_ca/B20260193867',
            snippetsUsed: 2,
            via: 'ai',
          },
        },
      },
    ];

    const rows = hitsToEvidence('lead-2', hits);
    expect(rows.filter((r) => r.source === 'opencorporates').length).toBeGreaterThanOrEqual(8);
    expect(rows.find((r) => r.field === 'entity_number')?.value).toBe('B20260193867');
  });
});
