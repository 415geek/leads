import type { CaSosBeEntity } from '@/lib/ca-sos/be-public-search';
import { primaryOfficerFromCaSosEntity } from '@/lib/ca-sos/be-public-search';
import type { LeadEvidenceInsert } from '@/types/lead-evidence';

function formatAddress(parts: Array<string | null | undefined>): string | null {
  const line = parts.map((p) => (typeof p === 'string' ? p.trim() : '')).filter(Boolean);
  return line.length > 0 ? line.join(', ') : null;
}

function formatAddressMultiline(parts: {
  street1?: string | null;
  street2?: string | null;
  city?: string | null;
  zip?: string | null;
  state?: string | null;
  country?: string | null;
}): string | null {
  const lines: string[] = [];
  const s1 = parts.street1?.trim();
  const s2 = parts.street2?.trim();
  if (s1) lines.push(s2 ? `${s1} ${s2}` : s1);
  else if (s2) lines.push(s2);
  if (parts.city?.trim()) lines.push(parts.city.trim());
  if (parts.zip?.trim()) lines.push(parts.zip.trim());
  if (parts.state?.trim()) lines.push(parts.state.trim());
  if (parts.country?.trim()) lines.push(parts.country.trim());
  return lines.length > 0 ? lines.join('\n') : null;
}

function shortOfficerRole(position: string | undefined): string {
  const p = position?.trim().toLowerCase() ?? '';
  if (!p || p === 'registered agent') return 'agent';
  return p;
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
  const street = formatAddressMultiline({
    street1: entity.EntityStreetAddress1,
    street2: entity.EntityStreetAddress2,
    city: entity.EntityCity,
    zip: entity.EntityZipCode,
    state: entity.EntityState,
    country: 'United States',
  });
  if (street) return street;

  const mailing = formatAddressMultiline({
    street1: entity.MailingStreetAddress1,
    street2: entity.MailingStreetAddress2,
    city: entity.MailingCity,
    zip: entity.MailingZipCode,
    state: entity.MailingState,
    country: 'United States',
  });
  if (mailing) return mailing;

  return formatAddressMultiline({
    street1: entity.AgentAddress1,
    street2: entity.AgentAddress2,
    city: entity.AgentCity,
    zip: entity.AgentZipCode,
    state: entity.AgentState,
    country: 'United States',
  });
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
  const role = shortOfficerRole(officer?.position);
  pushRow(rows, leadId, 'owner_name', person, fetchedAt, confidenceRaw, {
    ...snapshot,
    position: role,
  });
  if (person) {
    pushRow(
      rows,
      leadId,
      'officer_role',
      `${person}, ${role}`,
      fetchedAt,
      confidenceRaw,
      snapshot,
    );
  }

  return rows;
}
