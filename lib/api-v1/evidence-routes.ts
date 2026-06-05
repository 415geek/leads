import { v1Error, v1Json } from '@/lib/api-v1/response';
import { crossValidateLeadById, isLeadEvidenceCrossValidateEnabled } from '@/lib/evidence/cross-validate-lead';
import { isLeadEvidenceWriteEnabled } from '@/lib/evidence/evidence-write-flag';
import { persistOwnerSearchForLead } from '@/lib/evidence/persist-owner-search';
import type { OwnerKeywordAnalysis } from '@/lib/whitepages/owner-keyword-match';
import type { WhitepagesPersonRecord } from '@/lib/whitepages/owner-search';
import {
  isLeadSkipTraceEnrichEnabled,
  skipTraceEnrichLeadById,
} from '@/lib/enrichment/enrich-lead';
import { SkipTraceError } from '@/lib/enrichment/types';
import { identifyLeadById, isLeadIdentifyEnabled } from '@/lib/identity/identify-lead';
import {
  isLeadPropertyLookupEnabled,
  propertyLookupLeadById,
} from '@/lib/property/lookup-lead';
import { PropertyError } from '@/lib/property/types';
import type { SupabaseClient } from '@supabase/supabase-js';

function mapPipelineError(err: unknown): Response | null {
  const statusCode = (err as Error & { statusCode?: number }).statusCode;
  if (statusCode === 404) return v1Error('Lead 不存在', 404);
  if (statusCode === 400) return v1Error((err as Error).message, 400);
  if (err instanceof SkipTraceError || err instanceof PropertyError) {
    const code = err.code;
    const http =
      code === 'auth' || code === 'config' ? 503 : code === 'rate_limit' ? 429 : 502;
    return v1Error(err.message, http, code);
  }
  return null;
}

export async function v1CrossValidateLead(
  supabase: SupabaseClient,
  leadId: string,
): Promise<Response> {
  if (!isLeadEvidenceCrossValidateEnabled()) {
    return v1Error(
      '证据链交叉验证未启用',
      503,
      '设置 ENABLE_LEAD_EVIDENCE_CROSS_VALIDATE=1 并执行 lead_evidence 迁移',
    );
  }
  try {
    const result = await crossValidateLeadById(supabase, leadId);
    if (!result.schemaReady) {
      return v1Error('数据库 schema 未就绪', 503, result.schemaHint);
    }
    return v1Json({ ok: true, ...result });
  } catch (err) {
    return mapPipelineError(err) ?? v1Error('交叉验证失败', 500);
  }
}

export async function v1IdentifyLead(supabase: SupabaseClient, leadId: string): Promise<Response> {
  if (!isLeadIdentifyEnabled()) {
    return v1Error('经营主体识别未启用', 503, '设置 ENABLE_LEAD_IDENTIFY=1');
  }
  try {
    const result = await identifyLeadById(supabase, leadId);
    if (!result.schemaReady) {
      return v1Error('数据库 schema 未就绪', 503, result.schemaHint);
    }
    return v1Json({ ok: true, ...result });
  } catch (err) {
    return mapPipelineError(err) ?? v1Error('识别失败', 500);
  }
}

export async function v1PropertyLookupLead(
  supabase: SupabaseClient,
  leadId: string,
): Promise<Response> {
  if (!isLeadPropertyLookupEnabled()) {
    return v1Error('地产 lookup 未启用', 503, '设置 ENABLE_LEAD_PROPERTY_LOOKUP=1');
  }
  try {
    const result = await propertyLookupLeadById(supabase, leadId);
    if (!result.schemaReady) {
      return v1Error('数据库 schema 未就绪', 503, result.schemaHint);
    }
    return v1Json({ ok: true, ...result });
  } catch (err) {
    return mapPipelineError(err) ?? v1Error('地产查询失败', 500);
  }
}

export async function v1PersistOwnerSearchLead(
  supabase: SupabaseClient,
  leadId: string,
  body: {
    results?: WhitepagesPersonRecord[];
    analyses?: Record<string, OwnerKeywordAnalysis>;
    keyword_analysis_applied?: boolean;
    runCrossValidate?: boolean;
  },
): Promise<Response> {
  if (!isLeadEvidenceWriteEnabled()) {
    return v1Error(
      '证据链入库未启用',
      503,
      '设置 ENABLE_LEAD_EVIDENCE_WRITE=1 并执行 lead_evidence 迁移',
    );
  }
  try {
    const results = Array.isArray(body.results) ? body.results : [];
    const result = await persistOwnerSearchForLead(supabase, leadId, {
      results,
      analyses: body.analyses,
      keywordAnalysisApplied: Boolean(body.keyword_analysis_applied),
      runCrossValidate: body.runCrossValidate !== false,
    });
    if (!result.schemaReady) {
      return v1Error('数据库 schema 未就绪', 503, result.schemaHint);
    }
    return v1Json({ ok: true, ...result });
  } catch (err) {
    return mapPipelineError(err) ?? v1Error('证据入库失败', 500);
  }
}

export async function v1SkipTraceEnrichLead(
  supabase: SupabaseClient,
  leadId: string,
): Promise<Response> {
  if (!isLeadSkipTraceEnrichEnabled()) {
    return v1Error('Skip-trace 写证据未启用', 503, '设置 ENABLE_LEAD_SKIP_TRACE_ENRICH=1');
  }
  try {
    const result = await skipTraceEnrichLeadById(supabase, leadId);
    if (!result.schemaReady) {
      return v1Error('数据库 schema 未就绪', 503, result.schemaHint);
    }
    return v1Json({ ok: true, ...result });
  } catch (err) {
    return mapPipelineError(err) ?? v1Error('Skip-trace 失败', 500);
  }
}
