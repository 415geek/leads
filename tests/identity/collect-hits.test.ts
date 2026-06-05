import { describe, expect, it, vi } from 'vitest';
import { collectIdentityHits } from '@/lib/identity/collect-hits';

vi.mock('@/lib/opencorporates/company-search', () => ({
  searchOpenCorporatesCompanies: vi.fn(),
}));

import { searchOpenCorporatesCompanies } from '@/lib/opencorporates/company-search';

describe('collectIdentityHits / hitsFromSourceRaw', () => {
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
    expect(hits[0]?.rawPayload).toEqual({ from: 'ownership_name' });
  });

  it('searches OpenCorporates by ownership_name and attaches CEO', async () => {
    vi.mocked(searchOpenCorporatesCompanies).mockResolvedValue([
      {
        name: 'ORIGINAL BUFFALO WINGS INC',
        jurisdiction_code: 'us_ca',
        company_number: 'B20260090692',
        registered_address: '2499 LOMBARD ST, SAN FRANCISCO, 94123, CA',
        officers: [
          { name: 'JINZHUO HUANG', position: 'chief financial officer' },
          { name: 'QITING LEI', position: 'chief executive officer' },
        ],
        opencorporates_url: 'https://opencorporates.com/companies/us_ca/1',
      },
    ]);

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

    expect(searchOpenCorporatesCompanies).toHaveBeenCalledWith(
      'Original Buffalo Wings Inc.',
      expect.objectContaining({ jurisdictionCode: 'us_ca' }),
    );

    const oc = hits.find((h) => h.source === 'opencorporates');
    expect(oc?.personName).toBe('QITING LEI');
    expect(oc?.entityName).toBe('ORIGINAL BUFFALO WINGS INC');
  });
});
