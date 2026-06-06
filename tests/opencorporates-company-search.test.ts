import { describe, expect, it, vi } from 'vitest';
import {
  formatOcCompaniesForPrompt,
  jurisdictionFromStateCode,
  searchOpenCorporatesCompanies,
  searchRegistryCompanies,
} from '@/lib/opencorporates/company-search';

vi.mock('@/lib/ca-sos/be-public-search', () => ({
  caSosApiConfigured: vi.fn(() => true),
  searchCaSosCompanies: vi.fn(),
}));

import { searchCaSosCompanies } from '@/lib/ca-sos/be-public-search';

describe('jurisdictionFromStateCode', () => {
  it('maps US state codes', () => {
    expect(jurisdictionFromStateCode('CA')).toBe('us_ca');
    expect(jurisdictionFromStateCode('tx')).toBe('us_tx');
    expect(jurisdictionFromStateCode(undefined)).toBe('us');
  });
});

describe('formatOcCompaniesForPrompt', () => {
  it('formats officers and address', () => {
    const text = formatOcCompaniesForPrompt([
      {
        name: 'Lu Kitchen LLC',
        jurisdiction_code: 'us_ca',
        company_number: '123',
        registered_address: '123 Market St, San Francisco, CA',
        officers: [{ name: 'Tony Lu', position: 'director' }],
        opencorporates_url: 'https://opencorporates.com/companies/us_ca/123',
      },
    ]);
    expect(text).toContain('Lu Kitchen LLC');
    expect(text).toContain('Tony Lu');
    expect(text).toContain('123 Market St');
  });
});

describe('searchRegistryCompanies', () => {
  it('uses CA SOS for us_ca when configured', async () => {
    vi.mocked(searchCaSosCompanies).mockResolvedValue([
      {
        name: 'Lu Kitchen LLC',
        jurisdiction_code: 'us_ca',
        company_number: '123',
        registered_address: null,
        officers: [{ name: 'Tony Lu', position: 'registered agent' }],
        opencorporates_url: 'https://bizfileonline.sos.ca.gov/search/business',
        registry_provider: 'ca_sos',
      },
    ]);

    const result = await searchRegistryCompanies('Lu Kitchen LLC', {
      jurisdictionCode: 'us_ca',
    });
    expect(result.provider).toBe('ca_sos');
    expect(result.companies[0]?.officers[0]?.name).toBe('Tony Lu');
  });
});

describe('searchOpenCorporatesCompanies', () => {
  it('returns empty for short query', async () => {
    expect(await searchOpenCorporatesCompanies('a')).toEqual([]);
  });

  it('parses API response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: {
          companies: [
            {
              company: {
                name: 'Test LLC',
                jurisdiction_code: 'us_ca',
                company_number: '999',
                registered_address: {
                  street_address: '1 Main',
                  locality: 'SF',
                  region: 'CA',
                },
                officers: [{ officer: { name: 'Jane Doe', position: 'agent' } }],
              },
            },
          ],
        },
      }),
    });

    const hits = await searchOpenCorporatesCompanies('Test LLC', {
      jurisdictionCode: 'us_ca',
      fetchImpl: fetchImpl as never,
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.officers[0]?.name).toBe('Jane Doe');
    expect(hits[0]?.registered_address).toContain('1 Main');
  });
});
