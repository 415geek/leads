import type { LeadStatus } from './lead';

/** CRM 终态：converted=成交(won)，not_interested=失效(lost) */
export type LeadOutcomeType = 'won' | 'lost';

export interface LeadOutcomeRow {
  id: string;
  lead_id: string;
  outcome: LeadOutcomeType;
  previous_status: LeadStatus | null;
  new_status: LeadStatus;
  lead_score: number | null;
  new_store_confidence: number | null;
  store_status: string | null;
  owner_person_name: string | null;
  source_count: number | null;
  is_chain: boolean | null;
  metro_area: string | null;
  source: string | null;
  opening_snapshot: Record<string, unknown> | null;
  created_at: string;
}

export interface LeadOutcomeInsert {
  lead_id: string;
  outcome: LeadOutcomeType;
  previous_status: LeadStatus | null;
  new_status: LeadStatus;
  lead_score?: number | null;
  new_store_confidence?: number | null;
  store_status?: string | null;
  owner_person_name?: string | null;
  source_count?: number | null;
  is_chain?: boolean | null;
  metro_area?: string | null;
  source?: string | null;
  opening_snapshot?: Record<string, unknown> | null;
}
