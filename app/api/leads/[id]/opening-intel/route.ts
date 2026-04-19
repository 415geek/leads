import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import type { Lead } from '@/types/lead';
import {
  mergeAiClassificationOpeningWeb,
  runOpeningIntelWeb,
} from '@/lib/opening-intel-web';

/**
 * POST — 详情页手动「刷新联网情报」，合并写入 leads.ai_classification.opening_intel_web
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const { data: lead, error: fetchError } = await supabaseAdmin
      .from('leads')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Lead 不存在' }, { status: 404 });
      }
      throw fetchError;
    }

    const payload = await runOpeningIntelWeb(lead as Lead);
    const merged = mergeAiClassificationOpeningWeb(lead.ai_classification, payload);

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('leads')
      .update({ ai_classification: merged })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      if (updateError.message?.includes('column') && updateError.message?.includes('ai_classification')) {
        return NextResponse.json(
          {
            error:
              '数据库尚未添加 ai_classification 列，请在 Supabase 执行 supabase/schema.sql 中的迁移后再试。',
          },
          { status: 409 },
        );
      }
      throw updateError;
    }

    return NextResponse.json({
      message: '联网情报已更新',
      opening_intel_web: payload,
      lead: updated,
    });
  } catch (error) {
    console.error('[POST /api/leads/[id]/opening-intel]', error);

    if (error instanceof Error && error.message.includes('ANTHROPIC_API_KEY')) {
      return NextResponse.json(
        { error: '未配置 ANTHROPIC_API_KEY，无法生成情报' },
        { status: 503 },
      );
    }

    if (error instanceof Error && error.message.includes('parse')) {
      return NextResponse.json(
        { error: '模型返回格式异常，请稍后重试' },
        { status: 502 },
      );
    }

    return NextResponse.json(
      { error: '刷新情报失败，请稍后重试' },
      { status: 500 },
    );
  }
}
