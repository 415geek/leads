import type { PropertyPermit } from './types';

export interface NewStoreSignalInput {
  permits: readonly PropertyPermit[];
  /** ABC / liquor license event dates (YYYY-MM-DD) */
  liquorLicenseDates?: readonly string[];
  /** Optional lease start dates */
  leaseDates?: readonly string[];
  /** Reference "today" for lookback (tests) */
  asOf?: Date;
}

export interface NewStoreSignalResult {
  isNewStore: boolean;
  confidence: number;
  /** Human-readable reason for evidence raw_payload */
  reason: string;
}

const DEFAULT_LOOKBACK_DAYS = 120;

function parseDate(s: string): Date | null {
  const t = s.trim();
  if (!t) return null;
  const d = new Date(t.length === 10 ? `${t}T12:00:00Z` : t);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / (24 * 60 * 60 * 1000);
}

/**
 * Heuristic: recent building permits + overlapping liquor/lease window → likely new opening.
 */
export function computeNewStoreSignal(input: NewStoreSignalInput): NewStoreSignalResult {
  const asOf = input.asOf ?? new Date();
  const lookbackMs = DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  const cutoff = new Date(asOf.getTime() - lookbackMs);

  const recentPermits = input.permits.filter((p) => {
    const d = parseDate(p.date);
    return d != null && d >= cutoff && d <= asOf;
  });

  const liquorDates = (input.liquorLicenseDates ?? [])
    .map(parseDate)
    .filter((d): d is Date => d != null && d >= cutoff && d <= asOf);

  const leaseDates = (input.leaseDates ?? [])
    .map(parseDate)
    .filter((d): d is Date => d != null && d >= cutoff && d <= asOf);

  const hasRecentPermit = recentPermits.length > 0;
  const hasLiquor = liquorDates.length > 0;
  const hasLease = leaseDates.length > 0;

  if (!hasRecentPermit && !hasLiquor && !hasLease) {
    return {
      isNewStore: false,
      confidence: 15,
      reason: 'no_recent_permit_or_license_window',
    };
  }

  let confidence = 40;
  if (hasRecentPermit) confidence += 25 + Math.min(15, recentPermits.length * 5);
  if (hasLiquor) confidence += 20;
  if (hasLease) confidence += 15;

  if (hasRecentPermit && (hasLiquor || hasLease)) {
    const permitDate = parseDate(recentPermits[0]!.date)!;
    const anchor = liquorDates[0] ?? leaseDates[0];
    if (anchor && daysBetween(permitDate, anchor) <= 90) {
      confidence += 15;
    }
  }

  confidence = Math.min(100, Math.max(0, confidence));
  const isNewStore = confidence >= 55;

  return {
    isNewStore,
    confidence,
    reason: [
      hasRecentPermit ? `permits:${recentPermits.length}` : null,
      hasLiquor ? 'liquor_window' : null,
      hasLease ? 'lease_window' : null,
    ]
      .filter(Boolean)
      .join('+'),
  };
}
