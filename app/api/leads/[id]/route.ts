import { NextRequest, NextResponse } from 'next/server';
import { recordLeadOutcomeOnStatusChange } from '@/lib/feedback/record-outcome';
import { supabaseAdmin } from '@/lib/supabase';
import type { Lead, LeadStatus, LeadUpdateInput } from '@/types/lead';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const { data, error } = await supabaseAdmin
      .from('leads')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Lead 不存在' }, { status: 404 });
      }
      throw error;
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[GET /api/leads/[id]]', error);
    return NextResponse.json(
      { error: '获取数据失败，请稍后重试' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body: LeadUpdateInput = await request.json();

    let previous: Lead | null = null;
    if (body.lead_status) {
      const { data: existing, error: readErr } = await supabaseAdmin
        .from('leads')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (readErr) throw readErr;
      if (!existing) {
        return NextResponse.json({ error: 'Lead 不存在' }, { status: 404 });
      }
      previous = existing as Lead;
    }

    const { data, error } = await supabaseAdmin
      .from('leads')
      .update(body)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Lead 不存在' }, { status: 404 });
      }
      throw error;
    }

    if (previous && body.lead_status && body.lead_status !== previous.lead_status) {
      try {
        await recordLeadOutcomeOnStatusChange(
          supabaseAdmin,
          data as Lead,
          previous.lead_status as LeadStatus,
          body.lead_status,
        );
      } catch (feedbackErr) {
        console.warn('[PATCH /api/leads/[id]] outcome record failed:', feedbackErr);
      }
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[PATCH /api/leads/[id]]', error);
    return NextResponse.json(
      { error: '更新失败，请稍后重试' },
      { status: 500 }
    );
  }
}
