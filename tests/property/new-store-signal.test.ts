import { describe, it, expect } from 'vitest';
import { computeNewStoreSignal } from '@/lib/property/new-store-signal';

describe('computeNewStoreSignal', () => {
  const asOf = new Date('2025-06-01T12:00:00Z');

  it('returns low confidence when no recent signals', () => {
    const r = computeNewStoreSignal({
      permits: [{ type: 'building', date: '2020-01-01' }],
      asOf,
    });
    expect(r.isNewStore).toBe(false);
    expect(r.confidence).toBeLessThan(30);
  });

  it('boosts confidence for recent permit + liquor window', () => {
    const r = computeNewStoreSignal({
      permits: [{ type: 'commercial', date: '2025-04-10' }],
      liquorLicenseDates: ['2025-05-01'],
      asOf,
    });
    expect(r.isNewStore).toBe(true);
    expect(r.confidence).toBeGreaterThanOrEqual(55);
  });
});
