/**
 * scoreV3 — 7-factor lead scoring (0..100, capped)
 *
 * Factor             Weight     Notes
 * ─────────────────  ─────────  ──────────────────────────────────────────────
 * freshness          0-40       ≤7d=40, ≤14d=35, ≤30d=30, ≤60d=20, ≤90d=10, >90d=0
 * AI confidence      0-20       conf * 20; null (Phase 1) → 0.8 * 20 = 16
 * metro weight       0-12       Tier1=12, Tier2=8, Tier3=5, unknown=3
 * enrichment         0-8        OPERATIONAL=8; otherwise 0
 * phone              0-5        has phone=5
 * multi-source bonus 0/15/25    source_count=2 → +15; ≥3 → +25
 * opening signal     -10/0/6/10 confirmed_new=+10, likely_new=+6, possible/null=0, weak=-10
 * chain penalty      0/-15      is_chain=true → -15
 * ─────────────────
 * MAX RAW            ~135 → Math.max(0, Math.min(100, raw))
 *
 * Upgrade from scoreV2:
 *   - metro weights changed: old 0-15 range → new 0-12 (Tier1/2/3 table)
 *   - enrichment/phone weights reduced to make room for multi-source + chain
 *   - opening_signals generalized beyond sf_gov to all adapters
 *   - chain penalty new
 *   - multi-source bonus new
 *   - NaN guards on all inputs (type-safe defaults)
 */

import type { MetroArea, NormalizedDraft } from '@/lib/sources/types';

// ─── Metro weight tiers ────────────────────────────────────────────────────

const TIER1: MetroArea[] = ['sf_bay', 'nyc', 'la'];
const TIER2: MetroArea[] = ['houston', 'chicago', 'dallas', 'miami', 'las_vegas'];
// Tier 3: all others (austin, seattle, boston, phoenix, denver, atlanta, unknown)

function metroWeight(metro: MetroArea | string): number {
  if ((TIER1 as string[]).includes(metro)) return 12;
  if ((TIER2 as string[]).includes(metro)) return 8;
  return 5;
}

// ─── Freshness ────────────────────────────────────────────────────────────

function freshnessFactor(dateStr: string | null): number {
  if (!dateStr) return 0;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return 0;
  const days = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (days < 0) return 40; // Future date from data source — treat as brand new
  if (days <= 7) return 40;
  if (days <= 14) return 35;
  if (days <= 30) return 30;
  if (days <= 60) return 20;
  if (days <= 90) return 10;
  return 0;
}

// ─── Opening signal bonus (generalized — works for all adapters) ───────────

type OpeningLabel =
  | 'confirmed_new_opening'
  | 'likely_new_opening'
  | 'possible_new_opening'
  | 'weak_signal';

function openingSignalBonus(draft: NormalizedDraft): number {
  const signals = draft.opening_signals ?? draft.houston_opening ?? draft.nyc_opening;
  if (!signals) return 0;

  const label =
    (signals as { new_opening_label?: OpeningLabel }).new_opening_label ??
    (signals as { display_status?: string }).display_status;

  switch (label) {
    case 'confirmed_new_opening':
    case 'confirmed':
      return 10;
    case 'likely_new_opening':
    case 'pre-opening':
      return 6;
    case 'possible_new_opening':
    case 'possible':
      return 0;
    case 'weak_signal':
    case 'weak':
      return -10;
    default:
      return 0;
  }
}

// ─── Score input ──────────────────────────────────────────────────────────

export interface ScoreInput {
  draft: NormalizedDraft;
  /** AI confidence 0..1; null = Phase 1 pass-through (uses 0.8 baseline) */
  confidence: number | null;
  /** Google Places returned OPERATIONAL status */
  hasEnrichment: boolean;
  /** From cross-validation step; defaults to 1 if not provided */
  source_count?: number;
  /** From chain-detect step; defaults to false if not provided */
  is_chain?: boolean;
}

export function scoreDraft(input: ScoreInput): number {
  const { draft, confidence, hasEnrichment } = input;

  // NaN guards — type-safe defaults prevent silent wrong scores
  const source_count =
    typeof input.source_count === 'number' && input.source_count >= 1
      ? input.source_count
      : 1;
  const is_chain = input.is_chain === true;

  const freshDate = draft.first_inspection_date ?? draft.license_date;
  const fresh = freshnessFactor(freshDate);

  // Phase 1: null → 0.8 baseline; Phase 2: clamp to [0,1]
  const conf = confidence === null ? 0.8 : Math.max(0, Math.min(1, confidence));

  const metro = metroWeight(draft.metro_area);
  const hasPhone = !!draft.phone;

  const multiSourceBonus = source_count >= 3 ? 25 : source_count === 2 ? 15 : 0;
  const openingBonus = openingSignalBonus(draft);
  const penalty = is_chain ? -15 : 0;

  const raw =
    fresh +
    conf * 20 +
    metro +
    (hasEnrichment ? 8 : 0) +
    (hasPhone ? 5 : 0) +
    multiSourceBonus +
    openingBonus +
    penalty;

  return Math.round(Math.max(0, Math.min(100, raw)));
}
