/**
 * Generic opening signal inference for permit/license-based data sources.
 *
 * SF and Houston have rich multi-signal detection (datasf-opening-intel,
 * houston-opening-intel). For all other metros, we infer from permit date alone:
 *
 *   < 7 days  → confirmed_new_opening  (+10 in scoreV3)
 *   < 30 days → likely_new_opening     (+6 in scoreV3)
 *   < 90 days → possible_new_opening   (0 in scoreV3, still marks as new)
 *   ≥ 90 days → null (no signal, skip)
 *
 * Returns a minimal DatasfOpeningSignals-compatible shape so score.ts can
 * read new_opening_label without knowing the source metro.
 */

import type { DatasfOpeningSignals } from '@/lib/datasf-opening-intel';

type MinimalOpeningSignal = Pick<
  DatasfOpeningSignals,
  'new_opening_label' | 'new_opening_score' | 'is_new_at_location' | 'is_new_business_entity'
> & {
  transfer_score: 0;
  transfer_label: 'none';
  reason_codes: ['RECENT_LOCATION_START'];
  normalized_address_key: string;
  manual_review_priority: 'low';
};

export function inferOpeningSignalFromPermitDate(
  licenseDateStr: string | null,
  addressKey: string = '',
): MinimalOpeningSignal | null {
  if (!licenseDateStr) return null;

  const d = new Date(licenseDateStr);
  if (Number.isNaN(d.getTime())) return null;

  const ageMs = Date.now() - d.getTime();
  if (ageMs < 0) {
    // Future-dated permit (pre-opening in system)
    return {
      new_opening_label: 'confirmed_new_opening',
      new_opening_score: 95,
      is_new_at_location: true,
      is_new_business_entity: true,
      transfer_score: 0,
      transfer_label: 'none',
      reason_codes: ['RECENT_LOCATION_START'],
      normalized_address_key: addressKey,
      manual_review_priority: 'low',
    };
  }

  const days = Math.floor(ageMs / (1000 * 60 * 60 * 24));

  if (days <= 7) {
    return {
      new_opening_label: 'confirmed_new_opening',
      new_opening_score: 90,
      is_new_at_location: true,
      is_new_business_entity: true,
      transfer_score: 0,
      transfer_label: 'none',
      reason_codes: ['RECENT_LOCATION_START'],
      normalized_address_key: addressKey,
      manual_review_priority: 'low',
    };
  }

  if (days <= 30) {
    return {
      new_opening_label: 'likely_new_opening',
      new_opening_score: 70,
      is_new_at_location: true,
      is_new_business_entity: false,
      transfer_score: 0,
      transfer_label: 'none',
      reason_codes: ['RECENT_LOCATION_START'],
      normalized_address_key: addressKey,
      manual_review_priority: 'low',
    };
  }

  if (days <= 90) {
    return {
      new_opening_label: 'possible_new_opening',
      new_opening_score: 40,
      is_new_at_location: false,
      is_new_business_entity: false,
      transfer_score: 0,
      transfer_label: 'none',
      reason_codes: ['RECENT_LOCATION_START'],
      normalized_address_key: addressKey,
      manual_review_priority: 'low',
    };
  }

  return null;
}
