import type { SupabaseClient } from '@supabase/supabase-js';
import type { OwnerKeywordAnalysis } from '@/lib/whitepages/owner-keyword-match';
import type { WhitepagesPersonRecord } from '@/lib/whitepages/owner-search';
import { isMissingSchemaError } from '@/lib/evidence/postgres-errors';
import {
  crossValidateLeadById,
  isLeadEvidenceCrossValidateEnabled,
  type CrossValidateLeadResult,
} from '@/lib/evidence/cross-validate-lead';
import { ownerSearchResultsToEvidence } from '@/lib/evidence/owner-search-to-evidence';

export interface PersistOwnerSearchInput {
  results: WhitepagesPersonRecord[];
  analyses?: Record<string, OwnerKeywordAnalysis>;
  keywordAnalysisApplied?: boolean;
  /** 写入 evidence 后是否尝试 cross-validate（仍需 ENABLE_LEAD_EVIDENCE_CROSS_VALIDATE=1） */
  runCrossValidate?: boolean;
}

export interface PersistOwnerSearchResult {
  leadId: string;
  evidenceInserted: number;
  schemaReady: boolean;
  schemaHint?: string;
  crossValidate?: CrossValidateLeadResult | null;
}

export async function persistOwnerSearchForLead(
  supabase: SupabaseClient,
  leadId: string,
  input: PersistOwnerSearchInput,
): Promise<PersistOwnerSearchResult> {
  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .select('id')
    .eq('id', leadId)
    .maybeSingle();

  if (leadErr) throw leadErr;
  if (!lead) {
    const err = new Error('Lead not found');
    (err as Error & { statusCode?: number }).statusCode = 404;
    throw err;
  }

  const evidenceRows = ownerSearchResultsToEvidence(leadId, input.results, {
    analyses: input.analyses,
    keywordAnalysisApplied: input.keywordAnalysisApplied,
  });

  if (evidenceRows.length === 0) {
    return {
      leadId,
      evidenceInserted: 0,
      schemaReady: true,
      crossValidate: null,
    };
  }

  const { error: insertErr } = await supabase.from('lead_evidence').insert(evidenceRows);
  if (insertErr) {
    if (isMissingSchemaError(insertErr)) {
      return {
        leadId,
        evidenceInserted: 0,
        schemaReady: false,
        schemaHint: 'lead_evidence 表不存在，请执行 20260602000000_lead_evidence.sql',
      };
    }
    throw insertErr;
  }

  let crossValidate: CrossValidateLeadResult | null = null;
  if (input.runCrossValidate !== false && isLeadEvidenceCrossValidateEnabled()) {
    crossValidate = await crossValidateLeadById(supabase, leadId);
  }

  return {
    leadId,
    evidenceInserted: evidenceRows.length,
    schemaReady: true,
    crossValidate,
  };
}
