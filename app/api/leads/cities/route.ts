import { NextRequest, NextResponse } from 'next/server';
import { listLeadCities } from '@/lib/leads/query-leads';
import type { LeadRegionFilterId } from '@/lib/region-config';

/**
 * GET /api/leads/cities?region=sf_bay
 * 返回当前地区线索中出现的城市列表（city 列 + 从 address 解析），供筛选器搜索/联想。
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const region = (searchParams.get('region') || 'all') as LeadRegionFilterId;
    const q = searchParams.get('q')?.trim() ?? undefined;

    const result = await listLeadCities(region, q);

    return NextResponse.json(result);
  } catch (error) {
    console.error('[GET /api/leads/cities]', error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: '获取城市列表失败', detail: msg }, { status: 500 });
  }
}
