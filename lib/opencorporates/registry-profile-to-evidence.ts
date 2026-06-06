import { formatCaSosFilingDate } from '@/lib/ca-sos/entity-to-evidence';
import type { WebRegistryProfile } from '@/lib/opencorporates/web-registry-profile';
import type { LeadEvidenceInsert } from '@/types/lead-evidence';

function pushRow(
  rows: LeadEvidenceInsert[],
  leadId: string,
  field: LeadEvidenceInsert['field'],
  value: string | null | undefined,
  fetchedAt: string,
  confidenceRaw: number | null,
  rawPayload: Record<string, unknown>,
): void {
  const v = value?.trim();
  if (!v) return;
  rows.push({
    lead_id: leadId,
    field,
    value: v,
    source: 'opencorporates',
    fetched_at: fetchedAt,
    confidence_raw: confidenceRaw,
    raw_payload: rawPayload,
  });
}

function formatFilingDate(raw: string | null): string | null {
  if (!raw?.trim()) return null;
  const isoTry = formatCaSosFilingDate(raw);
  if (isoTry && !isoTry.includes('Invalid')) return isoTry;
  return raw.trim();
}

/** OpenCorporates 网页抽取档案 → lead_evidence 行（与 CA SOS 字段对齐） */
export function webRegistryProfileToEvidenceRows(
  leadId: string,
  profile: WebRegistryProfile,
  confidenceRaw: number | null = 0.68,
): LeadEvidenceInsert[] {
  const fetchedAt = new Date().toISOString();
  const snapshot = {
    lookup: 'web_search',
    web_search_via: profile.via,
    registry_url: profile.registryUrl,
    snippets_used: profile.snippetsUsed,
  };
  const rows: LeadEvidenceInsert[] = [];

  pushRow(rows, leadId, 'owner_entity', profile.entityName, fetchedAt, confidenceRaw, snapshot);
  pushRow(rows, leadId, 'entity_number', profile.companyNumber, fetchedAt, confidenceRaw, snapshot);
  pushRow(rows, leadId, 'entity_status', profile.status, fetchedAt, confidenceRaw, snapshot);
  pushRow(
    rows,
    leadId,
    'filing_date',
    formatFilingDate(profile.incorporationDate),
    fetchedAt,
    confidenceRaw,
    snapshot,
  );
  pushRow(rows, leadId, 'entity_type', profile.companyType, fetchedAt, confidenceRaw, snapshot);
  pushRow(rows, leadId, 'jurisdiction', profile.jurisdiction, fetchedAt, confidenceRaw, snapshot);
  pushRow(
    rows,
    leadId,
    'registered_address',
    profile.registeredAddress,
    fetchedAt,
    confidenceRaw,
    snapshot,
  );
  pushRow(rows, leadId, 'agent_name', profile.agentName, fetchedAt, confidenceRaw, snapshot);
  pushRow(rows, leadId, 'agent_address', profile.agentAddress, fetchedAt, confidenceRaw, snapshot);

  const person = profile.agentName ?? profile.officers[0]?.name ?? null;
  pushRow(rows, leadId, 'owner_name', person, fetchedAt, confidenceRaw, snapshot);
  if (profile.directorsOfficers) {
    pushRow(rows, leadId, 'officer_role', profile.directorsOfficers, fetchedAt, confidenceRaw, snapshot);
  }

  return rows;
}
