import type { CaSosBeEntity } from '@/lib/ca-sos/be-public-search';
import { primaryOfficerFromCaSosEntity } from '@/lib/ca-sos/be-public-search';
import type { LeadEvidenceInsert } from '@/types/lead-evidence';

function formatAddress(parts: Array<string | null | undefined>): string | null {
  const line = parts.map((p) => (typeof p === 'string' ? p.trim() : '')).filter(Boolean);
  return line.length > 0 ? line.join(', ') : null;
}

/** Human-readable filing date (matches OpenCorporates-style display). */
export function formatCaSosFilingDate(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  const d = new Date(raw.trim());
  if (Number.isNaN(d.getTime())) return raw.trim();
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function registeredAddressFromEntity(entity: CaSosBeEntity): string | null {
  const street = formatAddress([
    entity.EntityStreetAddress1,
    entity.EntityStreetAddress2,
    entity.EntityCity,
    entity.EntityState,
    entity.EntityZipCode,
  ]);
  if (street) return street;

  const mailing = formatAddress([
    entity.MailingStreetAddress1,
    entity.MailingStreetAddress2,
    entity.MailingCity,
    entity.MailingState,
    entity.MailingZipCode,
  ]);
  if (mailing) return mailing;

  return formatAddress([
    entity.AgentAddress1,
    entity.AgentAddress2,
    entity.AgentCity,
    entity.AgentState,
    entity.AgentZipCode,
  ]);
}

function agentAddressFromEntity(entity: CaSosBeEntity): string | null {
  return formatAddress([
    entity.AgentAddress1,
    entity.AgentAddress2,
    entity.AgentCity,
    entity.AgentState,
    entity.AgentZipCode,
  ]);
}

function jurisdictionLabel(entity: CaSosBeEntity): string | null {
  const j = entity.Jurisdiction?.trim();
  if (!j) return 'California (US)';
  if (/california/i.test(j)) return 'California (US)';
  return j;
}

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
    source: 'ca_sos',
    fetched_at: fetchedAt,
    confidence_raw: confidenceRaw,
    raw_payload: rawPayload,
  });
}

/** Full CA SOS entity snapshot → lead_evidence rows (图2 字段). */
export function caSosEntityToEvidenceRows(
  leadId: string,
  entity: CaSosBeEntity,
  confidenceRaw: number | null = 0.85,
): LeadEvidenceInsert[] {
  const fetchedAt = new Date().toISOString();
  const officer = primaryOfficerFromCaSosEntity(entity);
  const snapshot = { ca_sos_entity_id: entity.EntityID, lookup: 'ca_sos_api' };
  const rows: LeadEvidenceInsert[] = [];

  pushRow(rows, leadId, 'owner_entity', entity.EntityName, fetchedAt, confidenceRaw, snapshot);
  pushRow(rows, leadId, 'entity_number', entity.EntityID, fetchedAt, confidenceRaw, snapshot);
  pushRow(
    rows,
    leadId,
    'entity_status',
    entity.StatusDescription,
    fetchedAt,
    confidenceRaw,
    snapshot,
  );
  pushRow(
    rows,
    leadId,
    'filing_date',
    formatCaSosFilingDate(entity.FilingDate),
    fetchedAt,
    confidenceRaw,
    snapshot,
  );
  pushRow(rows, leadId, 'entity_type', entity.EntityType, fetchedAt, confidenceRaw, snapshot);
  pushRow(rows, leadId, 'jurisdiction', jurisdictionLabel(entity), fetchedAt, confidenceRaw, snapshot);
  pushRow(
    rows,
    leadId,
    'registered_address',
    registeredAddressFromEntity(entity),
    fetchedAt,
    confidenceRaw,
    snapshot,
  );
  pushRow(rows, leadId, 'agent_name', entity.AgentName, fetchedAt, confidenceRaw, snapshot);
  pushRow(
    rows,
    leadId,
    'agent_address',
    agentAddressFromEntity(entity),
    fetchedAt,
    confidenceRaw,
    snapshot,
  );

  const person = officer?.name ?? entity.AgentName;
  pushRow(rows, leadId, 'owner_name', person, fetchedAt, confidenceRaw, {
    ...snapshot,
    position: officer?.position ?? 'agent',
  });
  if (officer?.position) {
    pushRow(rows, leadId, 'officer_role', officer.position, fetchedAt, confidenceRaw, snapshot);
  }

  return rows;
}
