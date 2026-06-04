import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { identifyLeadById, isLeadIdentifyEnabled } from '@/lib/identity/identify-lead';

export const maxDuration = 60;

export async function POST(request: Request) {
  if (!isLeadIdentifyEnabled()) {
    return NextResponse.json(
      {
        error: '经营主体识别未启用',
        hint: '设置 ENABLE_LEAD_IDENTIFY=1，并在 Supabase 执行 lead_evidence 迁移后再试。',
      },
      { status: 503 },
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const leadId = typeof body.leadId === 'string' ? body.leadId.trim() : '';
    if (!leadId) {
      return NextResponse.json({ error: 'leadId is required' }, { status: 400 });
    }

    const result = await identifyLeadById(supabaseAdmin, leadId);

    if (!result.schemaReady) {
      return NextResponse.json(
        {
          error: '数据库 schema 未就绪',
          hint: result.schemaHint,
          leadId: result.leadId,
        },
        { status: 503 },
      );
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const statusCode = (err as Error & { statusCode?: number }).statusCode;
    if (statusCode === 404) {
      return NextResponse.json({ error: 'Lead 不存在' }, { status: 404 });
    }
    console.error('[POST /api/leads/identify]', err);
    return NextResponse.json({ error: '识别失败，请稍后重试' }, { status: 500 });
  }
}
