import type { IdentityConsensusResult, IdentityNameHit } from './types';
import { entityNamesMatch, normalizeEntityName, normalizePersonName, personNamesMatch } from './normalize';

export const IDENTITY_LOCK_CONFIG = {
  /** Minimum distinct sources agreeing on person name */
  minPersonSources: 2,
  /** Or single high-trust source + entity match */
  minAgreementScore: 72,
} as const;

function pickMajorityPerson(hits: readonly IdentityNameHit[]): string | null {
  const persons = hits.map((h) => h.personName?.trim()).filter((p): p is string => Boolean(p));
  if (persons.length === 0) return null;

  let best = persons[0]!;
  let bestCount = 0;
  for (const candidate of persons) {
    const count = persons.filter((p) => personNamesMatch(p, candidate)).length;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

function pickEntity(hits: readonly IdentityNameHit[], fallbackDba: string): string | null {
  const entities = hits.map((h) => h.entityName?.trim()).filter((e): e is string => Boolean(e));
  if (entities.length === 0) return normalizeEntityName(fallbackDba) ? fallbackDba.trim() : null;

  let best = entities[0]!;
  let bestCount = 0;
  for (const candidate of entities) {
    const count = entities.filter((e) => entityNamesMatch(e, candidate)).length;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Aggregate identity hits from SoS / ABC / license snapshots.
 */
export function computeIdentityConsensus(
  hits: readonly IdentityNameHit[],
  fallbackDba: string,
): IdentityConsensusResult {
  if (hits.length === 0) {
    return {
      entityName: fallbackDba.trim() || null,
      personName: null,
      agreementScore: 0,
      locked: false,
      hits: [],
      reviewReason: 'no_identity_sources',
    };
  }

  const personName = pickMajorityPerson(hits);
  const entityName = pickEntity(hits, fallbackDba);

  const personSources = new Set<string>();
  if (personName) {
    for (const h of hits) {
      if (h.personName && personNamesMatch(h.personName, personName)) {
        personSources.add(h.source);
      }
    }
  }

  const entitySources = new Set<string>();
  if (entityName) {
    for (const h of hits) {
      if (h.entityName && entityNamesMatch(h.entityName, entityName)) {
        entitySources.add(h.source);
      }
    }
  }

  let agreementScore = 0;
  agreementScore += Math.min(50, personSources.size * 25);
  agreementScore += Math.min(30, entitySources.size * 15);
  if (personName && entityName && entityNamesMatch(entityName, fallbackDba)) {
    agreementScore += 10;
  }
  agreementScore = Math.min(100, agreementScore);

  const hasTrustedGovEntity = hits.some(
    (h) =>
      h.source === 'business_license' &&
      Boolean(h.entityName?.trim()) &&
      (h.confidenceRaw ?? 0) >= 0.85 &&
      h.rawPayload &&
      typeof h.rawPayload === 'object' &&
      (h.rawPayload as { from?: string }).from === 'ownership_name',
  );

  const locked =
    personSources.size >= IDENTITY_LOCK_CONFIG.minPersonSources ||
    agreementScore >= IDENTITY_LOCK_CONFIG.minAgreementScore ||
    hasTrustedGovEntity;

  return {
    entityName,
    personName,
    agreementScore,
    locked,
    hits: [...hits],
    reviewReason: locked ? null : 'insufficient_name_agreement',
  };
}
