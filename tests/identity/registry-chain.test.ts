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

  it('confirms when gov entity matches CA SOS registry hit', () => {
    const hits: IdentityNameHit[] = [
      {
        source: 'business_license',
        entityName: 'Pangea Management LLC',
        personName: null,
        confidenceRaw: 0.9,
        rawPayload: { from: 'ownership_name' },
      },
      {
        source: 'ca_sos',
        entityName: 'PANGEA MANAGEMENT LLC',
        personName: 'MICHAEL SHAO',
        confidenceRaw: 0.8,
        rawPayload: { position: 'registered agent', lookup: 'ca_sos_api' },
      },
    ];
    const r = resolveOwnerFromRegistryChain(hits);
    expect(r?.personName).toBe('MICHAEL SHAO');
  });

  it('confirms when high-confidence gov entity matches OC without ownership_name marker', () => {
    const hits: IdentityNameHit[] = [
      {
        source: 'business_license',
        entityName: 'Pangea Management LLC',
        personName: null,
        confidenceRaw: 0.9,
        rawPayload: { from: 'source_raw' },
      },
      {
        source: 'opencorporates',
        entityName: 'PANGEA MANAGEMENT LLC',
        personName: 'MICHAEL SHAO',
        confidenceRaw: 0.74,
        rawPayload: { position: 'chief executive officer', lookup: 'web_search' },
      },
    ];
    const r = resolveOwnerFromRegistryChain(hits);
    expect(r?.personName).toBe('MICHAEL SHAO');
    expect(r?.entityName).toBe('Pangea Management LLC');
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
