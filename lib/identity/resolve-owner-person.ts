import type { IdentityNameHit } from '@/lib/identity/types';
import { entityNamesMatch, normalizePersonName, personNamesMatch } from '@/lib/identity/normalize';

export interface OwnerPersonCandidate {
  source: string;
  personName: string;
  entityName?: string | null;
  /** 原始值（分歧时保留） */
  rawValue?: string;
}

export interface ResolveOwnerPersonEvidence {
  candidates: OwnerPersonCandidate[];
  agreeingSources: string[];
  disagreeing: { source: string; personName: string; entityName?: string | null }[];
}

export interface ResolveOwnerPersonResult {
  person: string | null;
  status: 'confirmed' | 'review';
  evidence: ResolveOwnerPersonEvidence;
}

function pickDisplayName(names: string[]): string {
  return names.reduce((best, cur) => (cur.length > best.length ? cur : best), names[0]!);
}

/**
 * 多源自然人投票：≥2 个独立 source 规范化后一致 → confirmed；否则 review（不写库）。
 */
export function resolveOwnerPerson(
  candidates: readonly OwnerPersonCandidate[],
): ResolveOwnerPersonResult {
  const withPerson = candidates
    .map((c) => ({
      ...c,
      personName: c.personName.trim(),
      rawValue: c.rawValue ?? c.personName,
    }))
    .filter((c) => c.personName.length > 0);

  if (withPerson.length === 0) {
    return {
      person: null,
      status: 'review',
      evidence: { candidates: [...candidates], agreeingSources: [], disagreeing: [] },
    };
  }

  let bestSources = new Set<string>();
  let bestNames: string[] = [];

  const seenKeys = new Set<string>();
  for (const c of withPerson) {
    const key = normalizePersonName(c.personName);
    if (!key || seenKeys.has(key)) continue;
    seenKeys.add(key);

    const cluster = withPerson.filter((x) => personNamesMatch(x.personName, c.personName));
    const sources = new Set(cluster.map((x) => x.source));
    if (sources.size > bestSources.size) {
      bestSources = sources;
      bestNames = cluster.map((x) => x.personName);
    }
  }

  const agreeingSources = [...bestSources];
  const disagreeing = withPerson
    .filter((c) => !personNamesMatch(c.personName, bestNames[0] ?? ''))
    .map((c) => ({
      source: c.source,
      personName: c.rawValue ?? c.personName,
      entityName: c.entityName ?? null,
    }));

  const confirmed = agreeingSources.length >= 2;
  const person = confirmed ? pickDisplayName(bestNames) : bestNames[0] ?? null;

  return {
    person,
    status: confirmed ? 'confirmed' : 'review',
    evidence: {
      candidates: [...candidates],
      agreeingSources,
      disagreeing,
    },
  };
}

export function ownerPersonCandidatesFromHits(
  hits: readonly IdentityNameHit[],
): OwnerPersonCandidate[] {
  return hits
    .filter((h) => h.personName?.trim())
    .map((h) => ({
      source: h.source,
      personName: h.personName!.trim(),
      entityName: h.entityName,
      rawValue: h.personName!.trim(),
    }));
}

/** 供单测：两实体名是否同一主体（Inc/LLC 后缀无关） */
export function ownerEntitiesReferToSameBusiness(a: string, b: string): boolean {
  return entityNamesMatch(a, b);
}
