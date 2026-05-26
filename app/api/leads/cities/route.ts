import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { collectCitiesFromLeadRows, type LeadCityRow } from '@/lib/lead-city';
import { sourceIdsForRegion, type LeadRegionFilterId } from '@/lib/region-config';

const PAGE_SIZE = 1000;
const MAX_PAGES = 8;

/**
 * GET /api/leads/cities?region=sf_bay
 * 返回当前地区线索中出现的城市列表（city 列 + 从 address 解析），供筛选器搜索/联想。
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const region = (searchParams.get('region') || 'all') as LeadRegionFilterId;
    const q = searchParams.get('q')?.trim().toLowerCase() ?? '';

    const srcIds = sourceIdsForRegion(region);
    const rows: LeadCityRow[] = [];

    for (let page = 0; page < MAX_PAGES; page++) {
      let query = supabaseAdmin
        .from('leads')
        .select('city, address')
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (srcIds && srcIds.length > 0) {
        query = query.in('source', srcIds);
      }

      const { data, error } = await query;
      if (error) throw error;
      if (!data?.length) break;
      rows.push(...(data as LeadCityRow[]));
      if (data.length < PAGE_SIZE) break;
    }

    let cities = collectCitiesFromLeadRows(rows, region);
    if (q) {
      cities = cities.filter((c) => c.toLowerCase().includes(q));
    }

    return NextResponse.json({ cities, scanned: rows.length, region });
  } catch (error) {
    console.error('[GET /api/leads/cities]', error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: '获取城市列表失败', detail: msg }, { status: 500 });
  }
}
