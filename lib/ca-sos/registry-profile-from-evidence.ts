import type { LeadEvidenceField } from '@/types/lead-evidence';

/** OpenCorporates-style CA SOS registry snapshot built from lead_evidence rows. */
export interface CaSosRegistryProfile {
  entityName: string | null;
  companyNumber: string | null;
  status: string | null;
  incorporationDate: string | null;
  companyType: string | null;
  jurisdiction: string | null;
  registeredAddress: string | null;
  agentName: string | null;
  agentAddress: string | null;
  directorsOfficers: string | null;
}

const PROFILE_FIELDS: LeadEvidenceField[] = [
  'owner_entity',
  'entity_number',
  'entity_status',
  'filing_date',
  'entity_type',
  'jurisdiction',
  'registered_address',
  'agent_name',
  'agent_address',
  'officer_role',
];

const REGISTRY_SOURCES = new Set(['ca_sos', 'opencorporates']);

export function caSosRegistryProfileFromEvidence(
  rows: ReadonlyArray<{ field: LeadEvidenceField; value: string; source: string }>,
): CaSosRegistryProfile | null {
  const registryRows = rows.filter(
    (r) => REGISTRY_SOURCES.has(r.source) && PROFILE_FIELDS.includes(r.field),
  );
  if (registryRows.length === 0) return null;

  const pick = (field: LeadEvidenceField): string | null => {
    const row =
      registryRows.find((r) => r.field === field && r.source === 'ca_sos') ??
      registryRows.find((r) => r.field === field);
    return row?.value?.trim() || null;
  };

  return {
    entityName: pick('owner_entity'),
    companyNumber: pick('entity_number'),
    status: pick('entity_status'),
    incorporationDate: pick('filing_date'),
    companyType: pick('entity_type'),
    jurisdiction: pick('jurisdiction'),
    registeredAddress: pick('registered_address'),
    agentName: pick('agent_name'),
    agentAddress: pick('agent_address'),
    directorsOfficers: pick('officer_role'),
  };
}
