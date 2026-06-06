import type { Lead } from '@/types/lead';
import { summarizeSfG8m3FromSourceRaw } from '@/lib/sf-data-sf-fields';

export interface OwnerSearchInitialValues {
  /** Whitepages 搜索用的自然人姓名 */
  name: string;
  region: string;
  address: string;
  /** DBA / 店名，用于交叉验证 */
  keywords: string;
  /** DataSF ownership_name 等法人实体，供 CA SOS / 登记 API 检索 */
  entityName?: string;
  /** California SOS entity number */
  caEntityNumber?: string;
}

/** 政府 source_raw 中的自然人老板字段（不含 ownership_name 法人实体） */
const PERSON_FIELD_KEYS = [
  'owner_name',
  'owner',
  'applicant',
  'registrant',
  'taxpayer_name',
  'tp_name',
  'OWNER',
  'OWNER_NAME',
  'OwnerName',
] as const;

function pickNaturalPersonFromSourceRaw(raw: Record<string, unknown> | null | undefined): string {
  if (!raw) return '';
  for (const key of PERSON_FIELD_KEYS) {
    const v = raw[key];
    if (typeof v === 'string') {
      const t = v.trim();
      if (t.length >= 2) return t;
    }
  }
  return '';
}

function pickLegalEntityFromSourceRaw(raw: Record<string, unknown> | null | undefined): string {
  if (!raw) return '';
  for (const key of ['ownership_name', 'legal_name', 'business_name', 'entity_name', 'company_name'] as const) {
    const v = raw[key];
    if (typeof v === 'string') {
      const t = v.trim();
      if (t.length >= 2) return t;
    }
  }
  const sf = summarizeSfG8m3FromSourceRaw(raw);
  return sf?.ownershipName?.trim() ?? '';
}

function parseStateFromAddress(address: string | null | undefined): string | null {
  if (!address) return null;
  const tail = address.match(/,\s*([A-Z]{2})(?:\s+\d{5}(?:-\d{4})?)?\s*$/i);
  if (tail?.[1]) return tail[1].toUpperCase();
  const embedded = address.match(/\b([A-Z]{2})\s+\d{5}\b/);
  return embedded?.[1]?.toUpperCase() ?? null;
}

function buildRegion(city: string | null | undefined, address: string | null | undefined): string {
  const c = city?.trim() ?? '';
  const state = parseStateFromAddress(address);
  if (c && state) return `${c}, ${state}`;
  return c;
}

/**
 * 预填老板搜索：姓名优先 owner_person_name（identify 后 OC 高管），
 * 法人实体单独走 entityName 供 OpenCorporates 交叉验证。
 */
export function buildOwnerSearchDefaultsFromLead(
  lead: Pick<
    Lead,
    | 'name'
    | 'address'
    | 'city'
    | 'source_raw'
    | 'owner_person_name'
    | 'owner_entity_name'
    | 'ca_entity_number'
  >,
): OwnerSearchInitialValues {
  const personFromLead = lead.owner_person_name?.trim() ?? '';
  const personFromRaw = pickNaturalPersonFromSourceRaw(lead.source_raw ?? null);
  const entityFromLead = lead.owner_entity_name?.trim() ?? '';
  const entityFromRaw = pickLegalEntityFromSourceRaw(lead.source_raw ?? null);
  const address = lead.address?.trim() ?? '';
  const businessName = lead.name?.trim() ?? '';

  return {
    name: personFromLead || personFromRaw,
    region: buildRegion(lead.city, address || lead.address),
    address,
    keywords: businessName,
    entityName: entityFromLead || entityFromRaw || undefined,
    caEntityNumber: lead.ca_entity_number?.trim() || undefined,
  };
}

export {
  pickNaturalPersonFromSourceRaw as pickOwnerNameFromSourceRaw,
  pickLegalEntityFromSourceRaw,
  parseStateFromAddress,
  buildRegion,
};
