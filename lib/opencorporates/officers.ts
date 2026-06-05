import type { OcOfficerHit } from '@/lib/opencorporates/company-search';

const POSITION_RANK: Array<{ pattern: RegExp; rank: number }> = [
  { pattern: /\bchief executive\b|\bceo\b/i, rank: 0 },
  { pattern: /\bpresident\b|\bmanaging member\b|\bowner\b/i, rank: 1 },
  { pattern: /\bchief financial\b|\bcfo\b/i, rank: 2 },
  { pattern: /\bdirector\b|\bmanager\b|\bprincipal\b/i, rank: 3 },
  { pattern: /\bagent\b|\bsecretary\b/i, rank: 4 },
];

function officerRank(position: string): number {
  for (const { pattern, rank } of POSITION_RANK) {
    if (pattern.test(position)) return rank;
  }
  return 5;
}

/** 从 OpenCorporates officers 列表选出最像「老板/决策者」的一位（CEO 优先）。 */
export function pickPrimaryOfficer(officers: readonly OcOfficerHit[]): OcOfficerHit | null {
  const active = officers.filter((o) => o.name?.trim() && !/inactive|resigned|former/i.test(o.position));
  const pool = active.length > 0 ? active : officers.filter((o) => o.name?.trim());
  if (pool.length === 0) return null;

  return [...pool].sort((a, b) => {
    const dr = officerRank(a.position) - officerRank(b.position);
    if (dr !== 0) return dr;
    return a.name.localeCompare(b.name);
  })[0]!;
}
