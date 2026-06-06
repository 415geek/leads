import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/intel/deep-person-intel', () => ({
  tavilySearchInDomains: vi.fn(),
}));

import { tavilySearchInDomains } from '@/lib/intel/deep-person-intel';
import { searchRegistryProfileViaWeb } from '@/lib/opencorporates/web-registry-profile';

describe('searchRegistryProfileViaWeb', () => {
  const originalTavily = process.env.TAVILY_API_KEY;
  const originalAnthropic = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TAVILY_API_KEY = 'test-tavily';
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    if (originalTavily === undefined) delete process.env.TAVILY_API_KEY;
    else process.env.TAVILY_API_KEY = originalTavily;
    if (originalAnthropic === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalAnthropic;
  });

  it('returns null when Tavily is not configured', async () => {
    delete process.env.TAVILY_API_KEY;
    const result = await searchRegistryProfileViaWeb('Celadon Table LLC');
    expect(result).toBeNull();
  });

  it('extracts registry fields from OpenCorporates snippets via regex fallback', async () => {
    vi.mocked(tavilySearchInDomains).mockResolvedValue([
      {
        title: 'Celadon Table LLC (California (US))',
        url: 'https://opencorporates.com/companies/us_ca/B20260193867',
        content:
          'Company Number B20260193867 Status Active Incorporation Date 23 April 2026 Registered agent: TOVANNAI NATASHA BONSHEA KELLY',
      },
    ]);

    const result = await searchRegistryProfileViaWeb('Celadon Table LLC');
    expect(result?.companyNumber).toBe('B20260193867');
    expect(result?.status).toBe('Active');
    expect(result?.agentName).toBe('TOVANNAI NATASHA BONSHEA KELLY');
    expect(result?.via).toBe('regex');
  });
});
