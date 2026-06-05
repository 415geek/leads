import { NextRequest, NextResponse } from 'next/server';
import { isMissingSchemaError } from '@/lib/evidence/postgres-errors';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: leadId } = await params;

    const { data: lead, error: leadErr } = await supabaseAdmin
      .from('leads')
      .select('id')
      .eq('id', leadId)
      .maybeSingle();

    if (leadErr) throw leadErr;
    if (!lead) {
      return NextResponse.json({ error: 'Lead 不存在' }, { status: 404 });
    }

    const { data: evidence, error: evErr } = await supabaseAdmin
      .from('lead_evidence')
      .select('id, field, value, source, fetched_at, confidence_raw, created_at')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(80);

    if (evErr) {
      if (isMissingSchemaError(evErr)) {
        return NextResponse.json({
          evidence: [],
          contacts: [],
          schemaReady: false,
          schemaHint: 'lead_evidence 表不存在，请在 Supabase 执行 20260602000000_lead_evidence.sql',
        });
      }
      throw evErr;
    }

    const { data: contacts, error: ctErr } = await supabaseAdmin
      .from('lead_contacts')
      .select('id, name, role, phone, email, email_inferred, source, confidence, created_at')
      .eq('lead_id', leadId)
      .order('confidence', { ascending: false, nullsFirst: false });

    if (ctErr) {
      if (isMissingSchemaError(ctErr)) {
        return NextResponse.json({
          evidence: evidence ?? [],
          contacts: [],
          schemaReady: true,
        });
      }
      throw ctErr;
    }

    return NextResponse.json({
      evidence: evidence ?? [],
      contacts: contacts ?? [],
      schemaReady: true,
    });
  } catch (error) {
    console.error('[GET /api/leads/[id]/evidence-chain]', error);
    return NextResponse.json({ error: '获取证据链失败' }, { status: 500 });
  }
}
