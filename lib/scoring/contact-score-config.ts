/** Tunable weights for evidence-based contact scoring (P3). */

export const CONTACT_SCORE_CONFIG = {
  /** Points per distinct evidence source (phone/email field). */
  perSourceWeight: 18,
  /** Cap on source contribution before multipliers. */
  sourceScoreCap: 72,
  /** Multiply normalized provider confidence (0..1) into score. */
  providerConfidenceMultiplier: 25,
  /** Bonus when phone evidence marks mobile. */
  mobileBonus: 8,
  /** Bonus when leads.owner_person_name is set (owner locked). */
  ownerLockedBonus: 10,
  thresholds: {
    usable: 80,
    review: 50,
  },
} as const;

export type ContactScoreStatus = 'usable' | 'review' | 'discarded';
