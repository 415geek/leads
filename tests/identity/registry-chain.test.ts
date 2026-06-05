import { describe, expect, it } from 'vitest';
import { resolveOwnerFromRegistryChain } from '@/lib/identity/registry-chain';
import type { IdentityNameHit } from '@/lib/identity/types';

describe('resolveOwnerFromRegistryChain', () => {
  it('confirms person when DataSF entity matches OpenCorporates', () => {
    const hits: IdentityNameHit[] = [
      {
        source: 'business_license',
        entityName: 'Original Buffalo Wings Inc.',
        personName: null,
        confidenceRaw: 0.9,
        rawPayload: { from: 'ownership_name' },
      },
      {
        source: 'opencorporates',
        entityName: 'ORIGINAL BUFFALO WINGS INC',
        personName: 'QITING LEI',
        confidenceRaw: 0.86,
        rawPayload: { position: 'chief executive officer' },
      },
    ];
    const r = resolveOwnerFromRegistryChain(hits);
    expect(r?.personName).toBe('QITING LEI');
    expect(r?.entityName).toBe('Original Buffalo Wings Inc.');
  });

  it('returns null when entities disagree', () => {
    const hits: IdentityNameHit[] = [
      {
        source: 'business_license',
        entityName: 'Foo LLC',
        personName: null,
        confidenceRaw: 0.9,
        rawPayload: { from: 'ownership_name' },
      },
      {
        source: 'opencorporates',
        entityName: 'Bar Inc',
        personName: 'Jane Doe',
        confidenceRaw: 0.86,
        rawPayload: {},
      },
    ];
    expect(resolveOwnerFromRegistryChain(hits)).toBeNull();
  });
});
