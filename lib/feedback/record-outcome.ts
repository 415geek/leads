import type { SupabaseClient } from '@supabase/supabase-js';
import type { Lead, LeadStatus } from '@/types/lead';
import type { LeadOutcomeInsert, LeadOutcomeType } from '@/types/lead-outcome';
import { isMissingSchemaError } from '@/lib/evidence/postgres-errors';
import { isLeadFeedbackEnabled } from './flags';
import { extractOpeningSnapshot } from './opening-snapshot';
import { outcomeForStatus, shouldRecordOutcomeTransition } from './outcome-status';

export interface RecordOutcomeResult {
  recorded: boolean;
  outcome?: LeadOutcomeType;
  schemaReady: boolean;
  schemaHint?: string;
  skippedReason?: string;
}

type LeadSnapshot = Pick<
  Lead,
  | 'id'
  | 'lead_status'
  | 'lead_score'
  | 'new_store_confidence'
  | 'store_status'
  | 'owner_person_name'
  | 'source_count'
  | 'is_chain'
  | 'metro_area'
  | 'source'
  | 'ai_classification'
>;

export function buildOutcomeInsert(
  lead: LeadSnapshot,
  previousStatus: LeadStatus,
  newStatus: LeadStatus,
): LeadOutcomeInsert | null {
  const outcome = outcomeForStatus(newStatus);
  if (!outcome || !shouldRecordOutcomeTransition(previousStatus, newStatus)) {
    return null;
  }
  return {
    lead_id: lead.id,
    outcome,
    previous_status: previousStatus,
    new_status: newStatus,
    lead_score: lead.lead_score ?? null,
    new_store_confidence: lead.new_store_confidence ?? null,
    store_status: lead.store_status ?? null,
    owner_person_name: lead.owner_person_name?.trim() || null,
    source_count: lead.source_count ?? null,
    is_chain: lead.is_chain ?? null,
    metro_area: lead.metro_area ?? null,
    source: lead.source ?? null,
    opening_snapshot: extractOpeningSnapshot(lead.ai_classification ?? null),
  };
}

export async function recordLeadOutcomeOnStatusChange(
  supabase: SupabaseClient,
  lead: LeadSnapshot,
  previousStatus: LeadStatus,
  newStatus: LeadStatus,
): Promise<RecordOutcomeResult> {
  if (!isLeadFeedbackEnabled()) {
    return { recorded: false, schemaReady: true, skippedReason: 'feedback_disabled' };
  }

  const row = buildOutcomeInsert(lead, previousStatus, newStatus);
  if (!row) {
    return { recorded: false, schemaReady: true, skippedReason: 'not_terminal_transition' };
  }

  const { error } = await supabase.from('lead_outcomes').insert(row);
  if (error) {
    if (isMissingSchemaError(error)) {
      return {
        recorded: false,
        schemaReady: false,
        schemaHint: 'lead_outcomes 表不存在，请执行 20260604000000_lead_outcomes.sql',
      };
    }
    if (error.code === '23505') {
      return {
        recorded: false,
        schemaReady: true,
        skippedReason: 'duplicate_outcome',
        outcome: row.outcome,
      };
    }
    throw error;
  }

  console.info(
    `[feedback] recorded outcome=${row.outcome} lead=${lead.id} score=${row.lead_score} prev=${previousStatus}`,
  );
  return { recorded: true, outcome: row.outcome, schemaReady: true };
}
