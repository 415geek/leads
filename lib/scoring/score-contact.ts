import type { LeadEvidenceField } from '@/types/lead-evidence';
import { CONTACT_SCORE_CONFIG, type ContactScoreStatus } from './contact-score-config';

export interface EvidenceRowForScoring {
  field: LeadEvidenceField;
  value: string;
  source: string;
  confidence_raw: number | null;
  raw_payload?: Record<string, unknown> | null;
}

export interface ScoredContactChannel {
  type: 'phone' | 'email';
  value: string;
  sourceCount: number;
  sources: string[];
  confidence: number;
  status: ContactScoreStatus;
  isMobile: boolean | null;
  dncFlag: boolean;
}

function normalizeValue(type: 'phone' | 'email', value: string): string {
  const v = value.trim().toLowerCase();
  if (type === 'email') return v;
  return v.replace(/\D/g, '');
}

function isMobileFromPayload(payload: Record<string, unknown> | null | undefined): boolean {
  if (!payload) return false;
  if (payload.isMobile === true) return true;
  const t = String(payload.type ?? '').toLowerCase();
  return t === 'mobile' || t === 'cell';
}

function providerNorm(raw: number | null): number {
  if (raw == null || Number.isNaN(raw)) return 0.5;
  if (raw > 1) return Math.min(1, raw / 100);
  return Math.max(0, Math.min(1, raw));
}

/**
 * Aggregate phone/email evidence by normalized value; return scored channels.
 */
export function scoreContactChannels(
  evidence: readonly EvidenceRowForScoring[],
  opts: { ownerPersonLocked?: boolean } = {},
): ScoredContactChannel[] {
  const { perSourceWeight, sourceScoreCap, providerConfidenceMultiplier, mobileBonus, ownerLockedBonus, thresholds } =
    CONTACT_SCORE_CONFIG;

  type Bucket = {
    type: 'phone' | 'email';
    value: string;
    sources: Set<string>;
    confidenceRaws: (number | null)[];
    mobile: boolean;
    dnc: boolean;
  };

  const buckets = new Map<string, Bucket>();

  for (const row of evidence) {
    if (row.field !== 'phone' && row.field !== 'email') continue;
    const type = row.field;
    const norm = normalizeValue(type, row.value);
    if (!norm) continue;
    const key = `${type}:${norm}`;
    let b = buckets.get(key);
    if (!b) {
      b = {
        type,
        value: row.value.trim(),
        sources: new Set(),
        confidenceRaws: [],
        mobile: false,
        dnc: false,
      };
      buckets.set(key, b);
    }
    b.sources.add(row.source);
    b.confidenceRaws.push(row.confidence_raw);
    if (type === 'phone') {
      if (isMobileFromPayload(row.raw_payload)) b.mobile = true;
      if (row.raw_payload?.dncFlag === true) b.dnc = true;
    }
  }

  const out: ScoredContactChannel[] = [];

  for (const b of buckets.values()) {
    const sourceCount = b.sources.size;
    let score = Math.min(sourceScoreCap, sourceCount * perSourceWeight);

    let avgProvider = 0.5;
    if (b.confidenceRaws.length > 0) {
      let sum = 0;
      for (const raw of b.confidenceRaws) {
        sum += providerNorm(raw);
      }
      avgProvider = sum / b.confidenceRaws.length;
    }
    score += avgProvider * providerConfidenceMultiplier;

    if (b.type === 'phone' && b.mobile) score += mobileBonus;
    if (opts.ownerPersonLocked) score += ownerLockedBonus;

    const confidence = Math.round(Math.min(100, Math.max(0, score)));
    let status: ContactScoreStatus = 'discarded';
    if (confidence >= thresholds.usable) status = 'usable';
    else if (confidence >= thresholds.review) status = 'review';

    out.push({
      type: b.type,
      value: b.value,
      sourceCount,
      sources: [...b.sources],
      confidence,
      status,
      isMobile: b.type === 'phone' ? b.mobile : null,
      dncFlag: b.dnc,
    });
  }

  return out.sort((a, b) => b.confidence - a.confidence);
}

/** Derive store signals from is_new_store evidence values. */
export function scoreNewStoreFromEvidence(
  evidence: readonly EvidenceRowForScoring[],
): { storeStatus: 'new' | 'old' | 'renewal' | 'unknown'; confidence: number | null } {
  const rows = evidence.filter((e) => e.field === 'is_new_store');
  if (rows.length === 0) {
    return { storeStatus: 'unknown', confidence: null };
  }

  let newVotes = 0;
  let oldVotes = 0;
  for (const r of rows) {
    const v = r.value.trim().toLowerCase();
    if (v === 'true' || v === '1' || v === 'new' || v === 'yes') newVotes += 1;
    if (v === 'false' || v === '0' || v === 'old' || v === 'no') oldVotes += 1;
  }

  if (newVotes > oldVotes) {
    const conf = Math.min(100, 50 + newVotes * 15);
    return { storeStatus: 'new', confidence: conf };
  }
  if (oldVotes > newVotes) {
    return { storeStatus: 'old', confidence: Math.min(100, 50 + oldVotes * 10) };
  }
  return { storeStatus: 'unknown', confidence: null };
}
