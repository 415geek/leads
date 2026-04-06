import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { generateOutreachMessage } from '@/lib/claude';
import { Lead } from '@/types/lead';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { lead_id } = body;

    if (!lead_id) {
      return NextResponse.json(
        { error: 'lead_id 是必填字段' },
        { status: 400 }
      );
    }

    const { data: lead, error: fetchError } = await supabaseAdmin
      .from('leads')
      .select('*')
      .eq('id', lead_id)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Lead 不存在' }, { status: 404 });
      }
      throw fetchError;
    }

    const outreachMessage = await generateOutreachMessage(lead as Lead);

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('leads')
      .update({ outreach_message: outreachMessage })
      .eq('id', lead_id)
      .select()
      .single();

    if (updateError) throw updateError;

    return NextResponse.json({
      message: '开发信生成成功',
      outreach_message: outreachMessage,
      lead: updated,
    });
  } catch (error) {
    console.error('[POST /api/leads/generate]', error);
    
    if (error instanceof Error && error.message.includes('API')) {
      return NextResponse.json(
        { error: 'AI 服务暂时不可用，请稍后重试' },
        { status: 503 }
      );
    }
    
    return NextResponse.json(
      { error: '生成开发信失败，请稍后重试' },
      { status: 500 }
    );
  }
}
