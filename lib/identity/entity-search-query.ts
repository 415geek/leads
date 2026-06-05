import type { LeadIdentityInput } from '@/lib/identity/collect-hits';

function strFromRaw(raw: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = raw[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

/**
 * OpenCorporates 应搜索法人实体名，而非 DBA 店名。
 * DataSF: ownership_name → OC → officer → Whitepages。
 */
export function resolveLegalEntitySearchQuery(lead: LeadIdentityInput): string {
  const raw = lead.source_raw;
  if (raw && typeof raw === 'object') {
    const ownership = strFromRaw(raw, ['ownership_name']);
    if (ownership) return ownership;

    const legal = strFromRaw(raw, ['legal_name', 'business_name', 'entity_name', 'company_name']);
    if (legal) return legal;
  }

  return lead.name.trim();
}
