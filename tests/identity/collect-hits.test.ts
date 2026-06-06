import { describe, expect, it, vi } from 'vitest';
import { collectIdentityHits } from '@/lib/identity/collect-hits';

vi.mock('@/lib/opencorporates/company-search', () => ({
  searchRegistryCompanies: vi.fn(),
}));

import { searchRegistryCompanies } from '@/lib/opencorporates/company-search';

vi.mock('@/lib/opencorporates/web-officers', () => ({
  searchOpenCorporatesOfficersViaWeb: vi.fn(),
}));

import { searchOpenCorporatesOfficersViaWeb } from '@/lib/opencorporates/web-officers';

describe('collectIdentityHits / hitsFromSourceRaw', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps DataSF ownership_name to entity, not DBA as person', async () => {
    const hits = await collectIdentityHits(
      {
        lead_id: 'x',
        name: 'Dumpling Patio',
        source: 'sf_gov',
        source_raw: {
          ownership_name: 'Original Buffalo Wings Inc.',
          dba_name: 'Dumpling Patio',
        },
      },
      { skipOc: true },
    );

    expect(hits).toHaveLength(1);
    expect(hits[0]?.entityName).toBe('Original Buffalo Wings Inc.');
    expect(hits[0]?.personName).toBeNull();
    expect(hits[0]?.rawPayload).toEqual({
      from: 'ownership_name',
      entity_kind: 'company',
    });
  });

  it('searches OpenCorporates by ownership_name and attaches CEO', async () => {
    vi.mocked(searchRegistryCompanies).mockResolvedValue({
      provider: 'ca_sos',
      companies: [
        {
          name: 'ORIGINAL BUFFALO WINGS INC',
          jurisdiction_code: 'us_ca',
          company_number: 'B20260090692',
          registered_address: '2499 LOMBARD ST, SAN FRANCISCO, 94123, CA',
          officers: [
            { name: 'JINZHUO HUANG', position: 'chief financial officer' },
            { name: 'QITING LEI', position: 'chief executive officer' },
          ],
          opencorporates_url: 'https://bizfileonline.sos.ca.gov/search/business',
          registry_provider: 'ca_sos',
        },
      ],
    });

    const hits = await collectIdentityHits(
      {
        lead_id: 'x',
        name: 'Dumpling Patio',
        metro_area: 'sf_bay',
        source: 'sf_gov',
        source_raw: { ownership_name: 'Original Buffalo Wings Inc.', dba_name: 'Dumpling Patio' },
      },
      { skipOc: false },
    );

    expect(searchRegistryCompanies).toHaveBeenCalledWith(
      'Original Buffalo Wings Inc.',
      expect.objectContaining({ jurisdictionCode: 'us_ca' }),
    );

    const reg = hits.find((h) => h.source === 'ca_sos');
    expect(reg?.personName).toBe('QITING LEI');
    expect(reg?.entityName).toBe('ORIGINAL BUFFALO WINGS INC');
  });

  it('skips OpenCorporates when ownership_name is a natural person', async () => {
    const hits = await collectIdentityHits(
      {
        lead_id: 'x',
        name: 'Maria Restaurant',
        source: 'sf_gov',
        source_raw: { ownership_name: 'Maria Garcia Lopez' },
      },
      { skipOc: false },
    );

    expect(searchRegistryCompanies).not.toHaveBeenCalled();
    expect(hits[0]?.personName).toBe('Maria Garcia Lopez');
  });

  it('falls back to web search when API returns company without officers', async () => {
    vi.mocked(searchRegistryCompanies).mockResolvedValue({
      provider: 'opencorporates',
      companies: [
        {
          name: 'PANGEA MANAGEMENT LLC',
          jurisdiction_code: 'us_ca',
          company_number: '1',
          registered_address: null,
          officers: [],
          opencorporates_url: 'https://opencorporates.com/companies/us_ca/1',
        },
      ],
    });
    vi.mocked(searchOpenCorporatesOfficersViaWeb).mockResolvedValue({
      officers: [{ name: 'MICHAEL SHAO', position: 'chief executive officer' }],
      primary: { name: 'MICHAEL SHAO', position: 'chief executive officer' },
      snippetsUsed: 2,
      via: 'regex',
    });

    const hits = await collectIdentityHits(
      {
        lead_id: 'x',
        name: 'Dumpling Kitchen',
        metro_area: 'sf_bay',
        source: 'sf_gov',
        source_raw: { ownership_name: 'Pangea Management LLC' },
      },
      { skipOc: false },
    );

    const oc = hits.find((h) => h.source === 'opencorporates');
    expect(oc?.personName).toBe('MICHAEL SHAO');
    expect(oc?.rawPayload).toMatchObject({ lookup: 'api+web_search' });
  });
});
