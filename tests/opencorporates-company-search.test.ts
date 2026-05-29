import { describe, expect, it, vi } from 'vitest';
import {
  formatOcCompaniesForPrompt,
  jurisdictionFromStateCode,
  searchOpenCorporatesCompanies,
} from '@/lib/opencorporates/company-search';

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
