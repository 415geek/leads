import type { LeadEvidenceSource } from '@/types/lead-evidence';
import { AttomProvider, MockPropertyProvider } from './attom';
import { GovernmentPropertyProvider } from './government';
import type { PropertyLookupResult, PropertyProvider } from './types';
import { PropertyError } from './types';

export type PropertyProviderId = 'attom' | 'government' | 'mock';

export function getPropertyProviderId(): PropertyProviderId {
  const raw = (process.env.PROPERTY_PROVIDER ?? 'attom').trim().toLowerCase();
  if (raw === 'mock') return 'mock';
  if (raw === 'government') return 'government';
  return 'attom';
}

export function propertyEvidenceSource(id: PropertyProviderId): LeadEvidenceSource {
  if (id === 'government') return 'business_license';
  return 'attom';
}

export function getPropertyProvider(fixture?: PropertyLookupResult): PropertyProvider {
  const id = getPropertyProviderId();
  if (id === 'government') {
    return new GovernmentPropertyProvider();
  }
  if (id === 'mock') {
    return new MockPropertyProvider(
      fixture ?? {
        apn: '123-456-789',
        propertyOwnerName: 'Downtown Holdings LLC',
        normalizedAddress: '100 Main St, Los Angeles, CA',
        permits: [{ type: 'building', date: '2025-03-15' }],
        rawPayload: { mock: true },
      },
    );
  }
  try {
    return new AttomProvider();
  } catch (err) {
    if (err instanceof PropertyError && err.code === 'config') throw err;
    throw new PropertyError('Failed to initialize property provider', 'config', err);
  }
}
