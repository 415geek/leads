/** 法人/业主名称是否像公司实体（LLC/Inc/Management 等） */
const COMPANY_MARKERS =
  /\b(LLC|L\.L\.C\.|INC|INCORPORATED|CORP|CORPORATION|LTD|LIMITED|LP|PLLC|PC|CO\.|COMPANY|MANAGEMENT|HOLDINGS|GROUP|ENTERPRISES|PARTNERS|RESTAURANTS?)\b/i;

export type EntityNameKind = 'company' | 'person' | 'unknown';

export function isLegalEntityCompanyName(name: string | null | undefined): boolean {
  const t = name?.trim() ?? '';
  if (t.length < 3) return false;
  return COMPANY_MARKERS.test(t);
}

export function isLikelyNaturalPersonName(name: string | null | undefined): boolean {
  const t = name?.trim() ?? '';
  if (t.length < 4 || COMPANY_MARKERS.test(t)) return false;
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length < 2 || parts.length > 5) return false;
  return parts.every((p) => /^[A-Za-z][A-Za-z.'-]*$/.test(p));
}

export function classifyEntityNameKind(name: string | null | undefined): EntityNameKind {
  const t = name?.trim() ?? '';
  if (!t) return 'unknown';
  if (isLegalEntityCompanyName(t)) return 'company';
  if (isLikelyNaturalPersonName(t)) return 'person';
  return 'unknown';
}

/** 未知时默认按公司走 OpenCorporates（多数政府 ownership 为 LLC） */
export function shouldSearchOpenCorporatesForEntity(name: string | null | undefined): boolean {
  const kind = classifyEntityNameKind(name);
  return kind === 'company' || kind === 'unknown';
}
