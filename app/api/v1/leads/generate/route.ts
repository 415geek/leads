import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { generateOutreachMessage } from '@/lib/claude';
import { v1Json, v1Error } from '@/lib/api-v1/response';
import { withApiV1Auth } from '@/lib/api-v1/with-auth';
import type { Lead } from '@/types/lead';

export const POST = withApiV1Auth(
  async (request: NextRequest) => {
    const body = await request.json();
    const lead_id = body.lead_id as string | undefined;

    if (!lead_id) {
      return v1Error('lead_id 是必填字段', 400);
    }

    const { data: lead, error: fetchError } = await supabaseAdmin
      .from('leads')
      .select('*')
      .eq('id', lead_id)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return v1Error('Lead 不存在', 404);
      }
      throw fetchError;
    }

    try {
      const outreachMessage = await generateOutreachMessage(lead as Lead);

      const { data: updated, error: updateError } = await supabaseAdmin
        .from('leads')
        .update({ outreach_message: outreachMessage })
        .eq('id', lead_id)
        .select()
        .single();

      if (updateError) throw updateError;

      return v1Json({
        message: '开发信生成成功',
        outreach_message: outreachMessage,
        lead: updated,
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('API')) {
        return v1Error('AI 服务暂时不可用，请稍后重试', 503);
      }
      throw error;
    }
  },
  'write',
);
