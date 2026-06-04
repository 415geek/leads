import { describe, it, expect } from 'vitest';
import { computeIdentityConsensus } from '@/lib/identity/consensus';
import type { IdentityNameHit } from '@/lib/identity/types';

describe('computeIdentityConsensus', () => {
  it('locks when two sources agree on person name', () => {
    const hits: IdentityNameHit[] = [
      {
        source: 'opencorporates',
        entityName: 'Golden Dragon LLC',
        personName: 'Jane Doe',
        confidenceRaw: 0.7,
      },
      {
        source: 'abc',
        entityName: 'Golden Dragon LLC',
        personName: 'Jane M Doe',
        confidenceRaw: 0.65,
      },
    ];
    const r = computeIdentityConsensus(hits, 'Golden Dragon');
    expect(r.locked).toBe(true);
    expect(r.personName).toBeTruthy();
    expect(r.agreementScore).toBeGreaterThanOrEqual(50);
  });

  it('requires review when only conflicting persons', () => {
    const hits: IdentityNameHit[] = [
      { source: 'abc', entityName: 'A LLC', personName: 'Alice', confidenceRaw: 0.5 },
      { source: 'business_license', entityName: 'A LLC', personName: 'Bob', confidenceRaw: 0.5 },
    ];
    const r = computeIdentityConsensus(hits, 'A LLC');
    expect(r.locked).toBe(false);
    expect(r.reviewReason).toBe('insufficient_name_agreement');
  });
});
