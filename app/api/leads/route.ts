import { NextRequest, NextResponse } from 'next/server';
import { listLeads, parseListLeadsFromSearchParams } from '@/lib/leads/query-leads';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const result = await listLeads(parseListLeadsFromSearchParams(searchParams));

    return NextResponse.json(result);
  } catch (error) {
    console.error('[GET /api/leads]', error);
    const msg = error instanceof Error ? error.message : String(error);
    // Supabase "column does not exist" → 用户 migration 没跑，给出具体提示
    const hint =
      /column .* does not exist/i.test(msg) || /42703/.test(msg)
        ? 'Supabase schema migration 未执行。请在 Supabase SQL Editor 运行 supabase/schema.sql 底部的 V1 migration 块，或暂时不要使用置信度筛选。'
        : undefined;
    return NextResponse.json(
      { error: '获取数据失败', detail: msg, hint },
      { status: 500 },
    );
  }
}
