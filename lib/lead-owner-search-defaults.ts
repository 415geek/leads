import type { Lead } from '@/types/lead';

export interface OwnerSearchInitialValues {
  name: string;
  region: string;
  address: string;
  keywords: string;
}

const OWNER_FIELD_KEYS = [
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

function pickOwnerNameFromSourceRaw(raw: Record<string, unknown> | null | undefined): string {
  if (!raw) return '';
  for (const key of OWNER_FIELD_KEYS) {
    const v = raw[key];
    if (typeof v === 'string') {
      const t = v.trim();
      if (t.length >= 2) return t;
    }
  }
  return '';
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

/** 从线索档案预填仪表盘「老板信息搜索」表单 */
export function buildOwnerSearchDefaultsFromLead(lead: Pick<Lead, 'name' | 'address' | 'city' | 'source_raw'>): OwnerSearchInitialValues {
  const ownerFromRaw = pickOwnerNameFromSourceRaw(lead.source_raw ?? null);
  const address = lead.address?.trim() ?? '';
  const businessName = lead.name?.trim() ?? '';

  return {
    name: ownerFromRaw,
    region: buildRegion(lead.city, address || lead.address),
    address,
    keywords: businessName,
  };
}

export { pickOwnerNameFromSourceRaw, parseStateFromAddress, buildRegion };
