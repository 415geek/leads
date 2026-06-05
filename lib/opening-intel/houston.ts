import type { HoustonOpeningDisplayStatus, HoustonOpeningIntel } from '@/lib/houston-opening-intel';
import {
  HOUSTON_LIKELY_NEW_STATUSES,
  HOUSTON_STATUS_CONFIDENCE,
} from '@/lib/opening-intel/config';
import type { HoustonOpeningSignals } from '@/lib/opening-intel/types';

export function buildHoustonOpeningSignals(
  displayStatus: HoustonOpeningDisplayStatus,
): HoustonOpeningSignals {
  return { metro: 'houston', displayStatus };
}

export function buildHoustonOpeningSignalsFromIntel(
  intel: HoustonOpeningIntel,
): HoustonOpeningSignals {
  return buildHoustonOpeningSignals(intel.display_status);
}

export function houstonConfidenceFromStatus(status: HoustonOpeningDisplayStatus): number {
  return HOUSTON_STATUS_CONFIDENCE[status] ?? 30;
}

export function houstonIsLikelyNewFromStatus(status: HoustonOpeningDisplayStatus): boolean {
  return HOUSTON_LIKELY_NEW_STATUSES.has(status);
}
