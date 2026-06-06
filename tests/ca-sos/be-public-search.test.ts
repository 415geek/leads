import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  caSosEntityToCompanyHit,
  fetchCaSosEntityByNumber,
  searchCaSosByKeyword,
  searchCaSosCompanies,
} from '@/lib/ca-sos/be-public-search';

describe('CA SOS BE Public Search', () => {
  const originalKey = process.env.CA_SOS_BE_SUBSCRIPTION_KEY;

  beforeEach(() => {
    process.env.CA_SOS_BE_SUBSCRIPTION_KEY = 'test-subscription-key';
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.CA_SOS_BE_SUBSCRIPTION_KEY;
    else process.env.CA_SOS_BE_SUBSCRIPTION_KEY = originalKey;
  });

  it('maps entity to company hit with registered agent', () => {
    const hit = caSosEntityToCompanyHit({
      EntityID: '202150010654',
      EntityName: 'Pure Moon LLC',
      EntityType: 'Limited Liability Company - CA',
      AgentName: 'Sierra Pearson',
      MailingStreetAddress1: '304 HAPPY ST',
      MailingCity: 'SACRAMENTO',
      MailingState: 'CA',
      MailingZipCode: '95818',
    });
    expect(hit.registry_provider).toBe('ca_sos');
    expect(hit.officers[0]?.name).toBe('Sierra Pearson');
    expect(hit.company_number).toBe('202150010654');
  });

  it('fetches entity by number with subscription header', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        EntityID: '202150010654',
        EntityName: 'Pure Moon LLC',
        EntityType: 'LLC',
        AgentName: 'Sierra Pearson',
      }),
    });

    const entity = await fetchCaSosEntityByNumber('202150010654', fetchImpl as never);
    expect(entity?.EntityName).toBe('Pure Moon LLC');
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining('/BusinessEntityDetails?entity-number=202150010654'),
      expect.objectContaining({
        headers: { 'Ocp-Apim-Subscription-Key': 'test-subscription-key' },
      }),
    );
  });

  it('keyword search parses EntityData array', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        RecordCount: 1,
        EntityData: [
          {
            EntityID: '1',
            EntityName: 'Lu Kitchen LLC',
            EntityType: 'LLC',
            AgentName: 'Tony Lu',
          },
        ],
      }),
    });

    const rows = await searchCaSosByKeyword('Lu Kitchen', { fetchImpl: fetchImpl as never });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.EntityName).toBe('Lu Kitchen LLC');
  });

  it('searchCaSosCompanies prefers entity number when provided', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        EntityID: '999',
        EntityName: 'Test LLC',
        EntityType: 'LLC',
        AgentName: 'Jane Doe',
      }),
    });

    const hits = await searchCaSosCompanies('ignored', {
      entityNumber: '999',
      fetchImpl: fetchImpl as never,
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.officers[0]?.name).toBe('Jane Doe');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
