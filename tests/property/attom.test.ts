import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AttomProvider, MockPropertyProvider } from '@/lib/property/attom';
import { PropertyError } from '@/lib/property/types';

describe('AttomProvider', () => {
  const prevKey = process.env.ATTOM_API_KEY;

  beforeEach(() => {
    process.env.ATTOM_API_KEY = 'test-key';
  });

  afterEach(() => {
    process.env.ATTOM_API_KEY = prevKey;
  });

  it('throws config when API key missing', () => {
    delete process.env.ATTOM_API_KEY;
    expect(() => new AttomProvider()).toThrow(PropertyError);
  });

  it('maps permits and owner from mock HTTP', async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          property: [
            {
              identifier: { apn: 'APN-1' },
              address: { oneLine: '1 Main St' },
              assessment: { owner: { owner1: { fullname: 'Landlord LLC' } } },
              building: {
                permits: [{ permitType: 'tenant improvement', permitDate: '2025-02-01' }],
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    const provider = new AttomProvider({ apiKey: 'k', fetchImpl: fetchImpl as typeof fetch });
    const result = await provider.lookup({ address: '1 Main St' });
    expect(result.apn).toBe('APN-1');
    expect(result.propertyOwnerName).toBe('Landlord LLC');
    expect(result.permits).toHaveLength(1);
  });

  it('times out with normalized error', async () => {
    const fetchImpl = vi.fn(async () => {
      throw Object.assign(new Error('aborted'), { name: 'TimeoutError' });
    });
    const provider = new AttomProvider({ apiKey: 'k', fetchImpl: fetchImpl as typeof fetch });
    await expect(provider.lookup({ address: 'x' })).rejects.toMatchObject({ code: 'timeout' });
  });
});

describe('MockPropertyProvider', () => {
  it('returns fixture without network', async () => {
    const p = new MockPropertyProvider({
      apn: null,
      propertyOwnerName: 'X',
      normalizedAddress: 'Y',
      permits: [],
      rawPayload: null,
    });
    const r = await p.lookup({ address: 'z' });
    expect(r.propertyOwnerName).toBe('X');
  });
});
