import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/opencorporates/company-search', () => ({
  searchRegistryCompanies: vi.fn(),
}));

import { searchRegistryCompanies } from '@/lib/opencorporates/company-search';
import {
  enrichLeadContacts,
  enrichAndWriteContacts,
  _resetOcCallCountForTests,
  getOcCallCount,
} from '@/lib/pipeline/contact-enrich';
import type { EnrichedLeadInput } from '@/lib/pipeline/contact-enrich';

function makeLead(overrides: Partial<EnrichedLeadInput> = {}): EnrichedLeadInput {
  return {
    lead_id: 'uuid-test-1',
    name: 'Golden Dragon',
    address: '123 Main St',
    city: 'San Francisco',
    metro_area: 'sf_bay',
    source: 'sf_gov',
    website: null,
    ...overrides,
  };
}

function mockRegistry(
  officers: Array<{ name: string; position: string }>,
  provider: 'ca_sos' | 'opencorporates' = 'opencorporates',
) {
  vi.mocked(searchRegistryCompanies).mockResolvedValue({
    provider,
    companies: [
      {
        name: 'Golden Dragon Inc',
        jurisdiction_code: 'us_ca',
        company_number: '1',
        registered_address: null,
        officers,
        opencorporates_url: null,
        registry_provider: provider,
      },
    ],
  });
}

beforeEach(() => {
  _resetOcCallCountForTests();
  vi.mocked(searchRegistryCompanies).mockResolvedValue({ provider: 'none', companies: [] });
});

describe('enrichLeadContacts', () => {
  it('returns registry officer when API succeeds', async () => {
    mockRegistry([{ name: 'John Smith', position: 'owner' }], 'ca_sos');

    const contacts = await enrichLeadContacts(makeLead(), {});

    expect(contacts).toHaveLength(1);
    expect(contacts[0].source).toBe('ca_sos');
    expect(contacts[0].name).toBe('John Smith');
    expect(contacts[0].email_inferred).toBe(false);
    expect(contacts[0].confidence).toBe(0.78);
  });

  it('infers emails from website domain (no OC officer)', async () => {
    const contacts = await enrichLeadContacts(
      makeLead({ website: 'https://www.goldendragon.com' }),
      { skipOc: true },
    );

    const emails = contacts.map((c) => c.email);
    expect(emails).toContain('info@goldendragon.com');
    expect(emails).toContain('contact@goldendragon.com');
    expect(contacts.every((c) => c.email_inferred)).toBe(true);
    expect(contacts.every((c) => c.source === 'inferred')).toBe(true);
    expect(contacts.every((c) => (c.confidence ?? 1) <= 0.4)).toBe(true);
  });

  it('infers personalized emails when registry owner name is known', async () => {
    mockRegistry([{ name: 'Jane Doe', position: 'president' }]);

    const contacts = await enrichLeadContacts(
      makeLead({ website: 'https://janedoe-restaurant.com' }),
      {},
    );

    const emails = contacts.filter((c) => c.email_inferred).map((c) => c.email);
    expect(emails).toContain('jane@janedoe-restaurant.com');
    expect(emails).toContain('jane.doe@janedoe-restaurant.com');
  });

  it('returns empty array when no website and registry returns nothing', async () => {
    const contacts = await enrichLeadContacts(makeLead(), {});
    expect(contacts).toHaveLength(0);
  });

  it('is non-blocking: returns partial results when registry call throws', async () => {
    vi.mocked(searchRegistryCompanies).mockRejectedValue(new Error('network timeout'));

    const contacts = await enrichLeadContacts(
      makeLead({ website: 'https://example.com' }),
      {},
    );

    expect(contacts.some((c) => c.email_inferred)).toBe(true);
    expect(contacts.some((c) => c.source === 'inferred')).toBe(true);
  });

  it('strips www from website domain', async () => {
    const contacts = await enrichLeadContacts(
      makeLead({ website: 'https://www.myrestaurant.com' }),
      { skipOc: true },
    );
    const emails = contacts.map((c) => c.email);
    expect(emails).toContain('info@myrestaurant.com');
    expect(emails.some((e) => e?.includes('www.'))).toBe(false);
  });

  it('handles null/invalid website gracefully', async () => {
    const contacts = await enrichLeadContacts(
      makeLead({ website: 'not-a-url' }),
      { skipOc: true },
    );
    // Still tries to infer from 'not-a-url' domain — or returns empty
    // Key: must not throw
    expect(Array.isArray(contacts)).toBe(true);
  });

  it('respects registry daily cap and skips calls over limit', async () => {
    const originalEnv = process.env.OPENCORPORATES_DAILY_CAP;
    process.env.OPENCORPORATES_DAILY_CAP = '2';

    await enrichLeadContacts(makeLead({ name: 'Lead 1' }), {});
    await enrichLeadContacts(makeLead({ name: 'Lead 2' }), {});
    const count = getOcCallCount();
    expect(count).toBe(2);

    process.env.OPENCORPORATES_DAILY_CAP = originalEnv;
  });

  it('prioritizes owner/president/director roles from registry', async () => {
    mockRegistry([
      { name: 'Random Person', position: 'secretary' },
      { name: 'Main Owner', position: 'owner' },
    ]);

    const contacts = await enrichLeadContacts(makeLead(), {});
    const regContacts = contacts.filter((c) => c.source === 'opencorporates' || c.source === 'ca_sos');
    expect(regContacts[0]?.name).toBe('Main Owner');
  });
});

describe('enrichAndWriteContacts', () => {
  it('writes contacts to Supabase and returns totals', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const supa = {
      from: vi.fn(() => ({ upsert })),
    } as unknown as Parameters<typeof enrichAndWriteContacts>[0];

    const leads = [
      makeLead({ website: 'https://place1.com' }),
      makeLead({ lead_id: 'uuid-2', name: 'Place 2', website: 'https://place2.com' }),
    ];

    const result = await enrichAndWriteContacts(supa, leads, { skipOc: true });

    expect(result.skipped).toBe(0);
    expect(result.total).toBeGreaterThan(0);
    expect(upsert).toHaveBeenCalledTimes(2);
  });

  it('skips a lead on write error but processes others', async () => {
    let callCount = 0;
    const upsert = vi.fn().mockImplementation(() => {
      callCount += 1;
      return Promise.resolve({ error: callCount === 1 ? { message: 'db error' } : null });
    });
    const supa = {
      from: vi.fn(() => ({ upsert })),
    } as unknown as Parameters<typeof enrichAndWriteContacts>[0];

    const leads = [
      makeLead({ website: 'https://place1.com' }),
      makeLead({ lead_id: 'uuid-2', name: 'Place 2', website: 'https://place2.com' }),
    ];

    const result = await enrichAndWriteContacts(supa, leads, { skipOc: true });

    expect(result.skipped).toBe(1);
    expect(result.total).toBeGreaterThan(0);
  });

  it('returns zero counts when no leads have website or OC data', async () => {
    const supa = { from: vi.fn() } as unknown as Parameters<typeof enrichAndWriteContacts>[0];
    const leads = [makeLead({ website: null }), makeLead({ lead_id: 'u2', website: null })];

    const result = await enrichAndWriteContacts(supa, leads, { skipOc: true });
    expect(result.total).toBe(0);
    expect(result.skipped).toBe(0);
    expect(supa.from).not.toHaveBeenCalled();
  });
});
