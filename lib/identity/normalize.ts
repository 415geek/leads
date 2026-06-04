const ENTITY_SUFFIXES =
  /\b(inc|incorporated|llc|l\.l\.c|corp|corporation|co|company|ltd|limited|lp|pllc|pc|dba)\b\.?/gi;

/**
 * Normalize business entity names for equality checks.
 */
export function normalizeEntityName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[,&.]/g, ' ')
    .replace(ENTITY_SUFFIXES, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalize person names (strip punctuation, collapse whitespace).
 */
export function normalizePersonName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z\u4e00-\u9fff\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function entityNamesMatch(a: string, b: string): boolean {
  const na = normalizeEntityName(a);
  const nb = normalizeEntityName(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

export function personNamesMatch(a: string, b: string): boolean {
  const na = normalizePersonName(a);
  const nb = normalizePersonName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const pa = na.split(' ');
  const pb = nb.split(' ');
  if (pa.length >= 2 && pb.length >= 2) {
    return pa[0] === pb[0] && pa[pa.length - 1] === pb[pb.length - 1];
  }
  return false;
}
