import { describe, it, expect } from 'vitest';
import { propertyLookupToEvidenceRows } from '@/lib/property/to-evidence';

describe('propertyLookupToEvidenceRows', () => {
  it('writes owner_entity separately from is_new_store for P3', () => {
    const rows = propertyLookupToEvidenceRows(
      'lead-1',
      {
        apn: '1',
        propertyOwnerName: 'Parcel Owner Inc',
        normalizedAddress: '100 Main',
        permits: [{ type: 'build', date: '2025-01-01' }],
        rawPayload: null,
      },
      { isNewStore: true, confidence: 80, reason: 'permits:1' },
    );
    const fields = rows.map((r) => r.field);
    expect(fields).toContain('owner_entity');
    expect(fields).toContain('is_new_store');
    const store = rows.find((r) => r.field === 'is_new_store');
    expect(store?.value).toBe('true');
    expect(store?.confidence_raw).toBe(80);
  });
});
