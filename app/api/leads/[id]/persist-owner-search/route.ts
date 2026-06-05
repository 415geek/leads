import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { isLeadEvidenceWriteEnabled } from '@/lib/evidence/evidence-write-flag';
import { persistOwnerSearchForLead } from '@/lib/evidence/persist-owner-search';
import type { OwnerKeywordAnalysis } from '@/lib/whitepages/owner-keyword-match';
import type { WhitepagesPersonRecord } from '@/lib/whitepages/owner-search';

export const maxDuration = 60;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!isLeadEvidenceWriteEnabled()) {
    return NextResponse.json(
      {
        error: '证据链入库未启用',
        hint: '设置 ENABLE_LEAD_EVIDENCE_WRITE=1，并确保已执行 lead_evidence 迁移。',
      },
      { status: 503 },
    );
  }

  try {
    const { id: leadId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const results = Array.isArray(body.results) ? (body.results as WhitepagesPersonRecord[]) : [];
    const analyses =
      body.analyses && typeof body.analyses === 'object'
        ? (body.analyses as Record<string, OwnerKeywordAnalysis>)
        : undefined;

    const result = await persistOwnerSearchForLead(supabaseAdmin, leadId, {
      results,
      analyses,
      keywordAnalysisApplied: Boolean(body.keyword_analysis_applied),
      runCrossValidate: body.runCrossValidate !== false,
    });

    if (!result.schemaReady) {
      return NextResponse.json(
        { error: '数据库 schema 未就绪', hint: result.schemaHint, leadId: result.leadId },
        { status: 503 },
      );
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const statusCode = (err as Error & { statusCode?: number }).statusCode;
    if (statusCode === 404) {
      return NextResponse.json({ error: 'Lead 不存在' }, { status: 404 });
    }
    console.error('[POST /api/leads/[id]/persist-owner-search]', err);
    return NextResponse.json({ error: '证据入库失败，请稍后重试' }, { status: 500 });
  }
}
