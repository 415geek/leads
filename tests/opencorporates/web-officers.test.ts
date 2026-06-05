import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/intel/deep-person-intel', () => ({
  tavilySearchInDomains: vi.fn(),
}));

import { tavilySearchInDomains } from '@/lib/intel/deep-person-intel';
import { searchOpenCorporatesOfficersViaWeb } from '@/lib/opencorporates/web-officers';

describe('searchOpenCorporatesOfficersViaWeb', () => {
  it('extracts CEO from opencorporates snippets via regex', async () => {
    vi.mocked(tavilySearchInDomains).mockResolvedValue([
      {
        title: 'PANGEA MANAGEMENT LLC',
        url: 'https://opencorporates.com/companies/us_ca/123',
        content: 'Officers: MICHAEL SHAO — chief executive officer',
      },
    ]);

    const r = await searchOpenCorporatesOfficersViaWeb('Pangea Management LLC');
    expect(r.primary?.name).toBe('MICHAEL SHAO');
    expect(r.via).toBe('regex');
  });
});
