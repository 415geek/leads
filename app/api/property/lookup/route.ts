import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import {
  isLeadPropertyLookupEnabled,
  propertyLookupLeadById,
} from '@/lib/property/lookup-lead';
import { PropertyError } from '@/lib/property/types';

export const maxDuration = 60;

export async function POST(request: Request) {
  if (!isLeadPropertyLookupEnabled()) {
    return NextResponse.json(
      {
        error: '地产 lookup 未启用',
        hint: '设置 ENABLE_LEAD_PROPERTY_LOOKUP=1，并在 Supabase 执行 lead_evidence 迁移后再试。',
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

    const result = await propertyLookupLeadById(supabaseAdmin, leadId);

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
    if (statusCode === 400) {
      return NextResponse.json({ error: (err as Error).message }, { status: 400 });
    }
    if (err instanceof PropertyError) {
      const http =
        err.code === 'auth' || err.code === 'config'
          ? 503
          : err.code === 'rate_limit'
            ? 429
            : 502;
      return NextResponse.json({ error: err.message, code: err.code }, { status: http });
    }
    console.error('[POST /api/property/lookup]', err);
    return NextResponse.json({ error: '地产查询失败，请稍后重试' }, { status: 500 });
  }
}
