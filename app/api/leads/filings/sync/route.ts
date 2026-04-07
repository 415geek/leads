import { NextRequest, NextResponse } from 'next/server';
import { replaceCaSosFilings, leadExists } from '@/lib/lead-filings';
import type { LeadFilingInput } from '@/types/lead';

/**
 * n8n / 自动化：用与 /api/leads/upsert 相同的 x-webhook-secret，
 * 将 CA SOS 抓取的备案列表写入指定 lead（会先清空该 lead 的 source=ca_sos 记录）。
 */
export async function POST(request: NextRequest) {
  try {
    const webhookSecret = request.headers.get('x-webhook-secret');
    if (webhookSecret !== process.env.N8N_WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const leadId = body.lead_id as string | undefined;
    const filings = body.filings as LeadFilingInput[] | undefined;

    if (!leadId || typeof leadId !== 'string') {
      return NextResponse.json({ error: '缺少 lead_id' }, { status: 400 });
    }
    if (!Array.isArray(filings)) {
      return NextResponse.json({ error: 'filings 须为数组' }, { status: 400 });
    }

    for (const f of filings) {
      if (!f?.filing_type || !String(f.filing_type).trim()) {
        return NextResponse.json(
          { error: '每条备案须包含 filing_type' },
          { status: 400 }
        );
      }
    }

    const exists = await leadExists(leadId);
    if (!exists) {
      return NextResponse.json({ error: 'Lead 不存在' }, { status: 404 });
    }

    const rows = await replaceCaSosFilings(leadId, filings);
    return NextResponse.json({
      message: '备案已同步',
      lead_id: leadId,
      count: rows.length,
    });
  } catch (error) {
    console.error('[POST /api/leads/filings/sync]', error);
    return NextResponse.json(
      { error: '同步失败' },
      { status: 500 }
    );
  }
}
