import type { LeadEvidenceInsert, LeadEvidenceSource } from '@/types/lead-evidence';
import type { NewStoreSignalResult } from './new-store-signal';
import type { PropertyLookupResult } from './types';

export function propertyLookupToEvidenceRows(
  leadId: string,
  lookup: PropertyLookupResult,
  signal: NewStoreSignalResult,
  source: LeadEvidenceSource = 'attom',
): LeadEvidenceInsert[] {
  const fetchedAt = new Date().toISOString();
  const rows: LeadEvidenceInsert[] = [];

  if (lookup.propertyOwnerName?.trim()) {
    rows.push({
      lead_id: leadId,
      field: 'owner_entity',
      value: lookup.propertyOwnerName.trim(),
      source,
      fetched_at: fetchedAt,
      confidence_raw: null,
      raw_payload: { role: 'property_owner', note: 'landlord_not_restaurant_operator' },
    });
  }

  if (lookup.normalizedAddress?.trim()) {
    rows.push({
      lead_id: leadId,
      field: 'address',
      value: lookup.normalizedAddress.trim(),
      source,
      fetched_at: fetchedAt,
      confidence_raw: null,
      raw_payload: lookup.apn ? { apn: lookup.apn } : null,
    });
  }

  rows.push({
    lead_id: leadId,
    field: 'is_new_store',
    value: signal.isNewStore ? 'true' : 'false',
    source,
    fetched_at: fetchedAt,
    confidence_raw: signal.confidence,
    raw_payload: {
      reason: signal.reason,
      permitCount: lookup.permits.length,
    },
  });

  return rows;
}
