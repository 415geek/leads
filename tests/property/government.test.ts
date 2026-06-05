import { describe, it, expect, afterEach } from 'vitest';
import {
  GovernmentPropertyProvider,
  governmentLookupFromSourceRaw,
} from '@/lib/property/government';
import { getPropertyProviderId, propertyEvidenceSource } from '@/lib/property/provider';

describe('governmentLookupFromSourceRaw', () => {
  it('extracts apn, permits and owner from source_raw', () => {
    const result = governmentLookupFromSourceRaw({
      address: '100 Main St, Houston, TX',
      sourceRaw: {
        apn: '123-456',
        permit_type: 'tenant improvement',
        issue_date: '2025-03-01',
        property_owner: 'Downtown Holdings LLC',
      },
    });
    expect(result.apn).toBe('123-456');
    expect(result.propertyOwnerName).toBe('Downtown Holdings LLC');
    expect(result.permits).toHaveLength(1);
    expect(result.permits[0]?.date).toBe('2025-03-01');
  });

  it('dedupes multiple date keys pointing to same day', () => {
    const result = governmentLookupFromSourceRaw({
      address: '1 St',
      sourceRaw: {
        issue_date: '2025-03-01',
        permit_date: '2025-03-01',
      },
    });
    expect(result.permits).toHaveLength(1);
  });

  it('works without source_raw', () => {
    const result = governmentLookupFromSourceRaw({
      address: '99 Oak Ave',
      apn: 'PIN-9',
    });
    expect(result.apn).toBe('PIN-9');
    expect(result.permits).toHaveLength(0);
  });
});

describe('getPropertyProviderId government', () => {
  const prev = process.env.PROPERTY_PROVIDER;

  afterEach(() => {
    process.env.PROPERTY_PROVIDER = prev;
  });

  it('selects government provider and evidence source', () => {
    process.env.PROPERTY_PROVIDER = 'government';
    expect(getPropertyProviderId()).toBe('government');
    expect(propertyEvidenceSource('government')).toBe('business_license');
  });
});

describe('GovernmentPropertyProvider', () => {
  it('returns government id without network', async () => {
    const p = new GovernmentPropertyProvider();
    expect(p.id).toBe('government');
    const r = await p.lookup({
      address: '1 St',
      sourceRaw: { license_date: '2026-01-15' },
    });
    expect(r.permits[0]?.date).toBe('2026-01-15');
  });
});
