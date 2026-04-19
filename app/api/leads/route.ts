import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { LeadFilters } from '@/types/lead';
import { sourceIdsForRegion, type LeadRegionFilterId } from '@/lib/region-config';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '25');
    const status = searchParams.get('status') as LeadFilters['status'];
    const city = searchParams.get('city');
    const region = searchParams.get('region') as LeadRegionFilterId | null;
    const cuisineType = searchParams.get('cuisine_type');
    const minScore = searchParams.get('min_score');
    const minConfidenceRaw = searchParams.get('min_confidence');
    const chineseOnly = searchParams.get('chinese_only');
    const search = searchParams.get('search');
    const sortBy = searchParams.get('sort') || 'lead_score';
    const sortOrder = searchParams.get('order') || 'desc';

    let query = supabaseAdmin
      .from('leads')
      .select('*', { count: 'exact' });

    if (status) {
      query = query.eq('lead_status', status);
    }
    // 从 registry 动态解析 metro → source ids。
    // 用 `source in (...)` 过滤（source 列始终存在），不依赖 metro_area 列，
    // 这样 supabase migration 未执行时仍然可用。
    if (region && region !== 'all') {
      const srcIds = sourceIdsForRegion(region);
      if (srcIds && srcIds.length > 0) {
        query = query.in('source', srcIds);
      }
    }
    if (city) {
      query = query.eq('city', city);
    }
    if (cuisineType) {
      query = query.ilike('cuisine_type', `%${cuisineType}%`);
    }
    if (minScore) {
      query = query.gte('lead_score', parseInt(minScore));
    }
    if (minConfidenceRaw) {
      const v = parseFloat(minConfidenceRaw);
      if (!Number.isNaN(v)) {
        // Phase 1 很多行 is_restaurant_confidence 是 NULL —— 用户选了阈值时包含 NULL（保守）
        query = query.or(
          `is_restaurant_confidence.gte.${v},is_restaurant_confidence.is.null`,
        );
      }
    }
    if (chineseOnly === '1' || chineseOnly === 'true') {
      // 中餐标签集合与 lib/bay-area-food-import/index.ts 一致
      query = query.in('cuisine_type', ['中餐', '川菜', '粤菜', '湘菜', '台湾菜', '东北菜']);
    }
    if (search) {
      query = query.or(`name.ilike.%${search}%,address.ilike.%${search}%`);
    }

    query = query
      .order(sortBy, { ascending: sortOrder === 'asc' })
      .range((page - 1) * limit, page * limit - 1);

    const { data, error, count } = await query;

    if (error) throw error;

    return NextResponse.json({
      data,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    });
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
