import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import {
  mergeAiClassificationOpeningWeb,
  runOpeningIntelWeb,
} from '@/lib/opening-intel-web';
import { v1Json, v1Error } from '@/lib/api-v1/response';
import { withApiV1AuthParams } from '@/lib/api-v1/with-auth';
import type { Lead } from '@/types/lead';

export const maxDuration = 120;

export const POST = withApiV1AuthParams<{ id: string }>(
  async (_request: NextRequest, _ctx, { params }) => {
    const { id } = await params;

    const { data: lead, error: fetchError } = await supabaseAdmin
      .from('leads')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return v1Error('Lead 不存在', 404);
      }
      throw fetchError;
    }

    try {
      const payload = await runOpeningIntelWeb(lead as Lead);
      const merged = mergeAiClassificationOpeningWeb(lead.ai_classification, payload);

      const { data: updated, error: updateError } = await supabaseAdmin
        .from('leads')
        .update({ ai_classification: merged })
        .eq('id', id)
        .select()
        .single();

      if (updateError) {
        if (
          updateError.message?.includes('column') &&
          updateError.message?.includes('ai_classification')
        ) {
          return v1Error(
            '数据库尚未添加 ai_classification 列，请在 Supabase 执行 schema 迁移后再试。',
            409,
          );
        }
        throw updateError;
      }

      return v1Json({
        message: '联网情报已更新',
        opening_intel_web: payload,
        lead: updated,
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('ANTHROPIC_API_KEY')) {
        return v1Error('未配置 ANTHROPIC_API_KEY，无法生成情报', 503);
      }
      if (error instanceof Error && error.message.includes('parse')) {
        return v1Error('模型返回格式异常，请稍后重试', 502);
      }
      throw error;
    }
  },
  'write',
);
