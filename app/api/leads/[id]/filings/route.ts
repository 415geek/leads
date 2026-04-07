import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { appendFilings, leadExists, replaceCaSosFilings } from '@/lib/lead-filings';
import type { LeadFilingInput } from '@/types/lead';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const { data, error } = await supabaseAdmin
      .from('lead_filings')
      .select('*')
      .eq('lead_id', id)
      .order('filed_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ filings: data ?? [] });
  } catch (error) {
    console.error('[GET /api/leads/[id]/filings]', error);
    return NextResponse.json(
      { error: '获取备案列表失败' },
      { status: 500 }
    );
  }
}

type PostBody = {
  mode?: 'append' | 'replace_ca_sos';
  filings: LeadFilingInput[];
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as PostBody;

    if (!Array.isArray(body.filings)) {
      return NextResponse.json({ error: 'filings 须为数组' }, { status: 400 });
    }

    const exists = await leadExists(id);
    if (!exists) {
      return NextResponse.json({ error: 'Lead 不存在' }, { status: 404 });
    }

    for (const f of body.filings) {
      if (!f?.filing_type || !String(f.filing_type).trim()) {
        return NextResponse.json(
          { error: '每条备案须包含 filing_type' },
          { status: 400 }
        );
      }
    }

    const mode = body.mode ?? 'append';

    if (mode === 'replace_ca_sos') {
      const rows = await replaceCaSosFilings(id, body.filings);
      return NextResponse.json({ ok: true, mode, count: rows.length });
    }

    const { inserted, errors } = await appendFilings(id, body.filings);
    return NextResponse.json({
      ok: true,
      mode: 'append',
      inserted,
      errors: errors.length ? errors : undefined,
    });
  } catch (error) {
    console.error('[POST /api/leads/[id]/filings]', error);
    return NextResponse.json(
      { error: '保存备案失败' },
      { status: 500 }
    );
  }
}
