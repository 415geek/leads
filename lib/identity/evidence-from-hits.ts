import { caSosEntityToEvidenceRows } from '@/lib/ca-sos/entity-to-evidence';
import type { CaSosBeEntity } from '@/lib/ca-sos/be-public-search';
import type { LeadEvidenceInsert } from '@/types/lead-evidence';
import type { IdentityNameHit } from './types';

export function hitsToEvidence(leadId: string, hits: IdentityNameHit[]): LeadEvidenceInsert[] {
  const fetchedAt = new Date().toISOString();
  const rows: LeadEvidenceInsert[] = [];

  for (const h of hits) {
    const caEntity = h.rawPayload?.ca_sos_entity as CaSosBeEntity | undefined;
    if (h.source === 'ca_sos' && caEntity?.EntityID) {
      rows.push(...caSosEntityToEvidenceRows(leadId, caEntity, h.confidenceRaw));
      continue;
    }

    if (h.entityName?.trim()) {
      rows.push({
        lead_id: leadId,
        field: 'owner_entity',
        value: h.entityName.trim(),
        source: h.source,
        fetched_at: fetchedAt,
        confidence_raw: h.confidenceRaw,
        raw_payload: h.rawPayload ?? null,
      });
    }
    if (h.personName?.trim()) {
      rows.push({
        lead_id: leadId,
        field: 'owner_name',
        value: h.personName.trim(),
        source: h.source,
        fetched_at: fetchedAt,
        confidence_raw: h.confidenceRaw,
        raw_payload: h.rawPayload ?? null,
      });
    }
  }

  return rows;
}
