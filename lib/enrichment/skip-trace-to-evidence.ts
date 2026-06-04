import type { LeadEvidenceField, LeadEvidenceInsert, LeadEvidenceSource } from '@/types/lead-evidence';
import type { SkipTraceResult } from './types';

/** Map skip-trace hits into lead_evidence rows (P2 → storage, used by n8n / enrich routes later). */
export function skipTraceToEvidenceRows(
  leadId: string,
  result: SkipTraceResult,
  source: LeadEvidenceSource = 'batchdata',
): LeadEvidenceInsert[] {
  const rows: LeadEvidenceInsert[] = [];
  const fetchedAt = new Date().toISOString();

  for (const phone of result.phones) {
    rows.push({
      lead_id: leadId,
      field: 'phone',
      value: phone.value,
      source,
      fetched_at: fetchedAt,
      confidence_raw: phone.confidenceRaw,
      raw_payload: {
        type: phone.type,
        isMobile: phone.isMobile,
        dncFlag: phone.dncFlag,
      },
    });
  }

  for (const email of result.emails) {
    rows.push({
      lead_id: leadId,
      field: 'email',
      value: email.value,
      source,
      fetched_at: fetchedAt,
      confidence_raw: email.confidenceRaw,
      raw_payload: null,
    });
  }

  return rows;
}
