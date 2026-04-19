import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { LeadFilters } from '@/types/lead';
import type { LeadRegionFilterId } from '@/lib/region-config';

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
    // 从 registry 动态解析 metro → source ids，不再硬编码。
    // 老数据已由 supabase/schema.sql 的 migration 回填了 metro_area，只走 metro_area 过滤即可。
    if (region && region !== 'all') {
      query = query.eq('metro_area', region);
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
    return NextResponse.json(
      { error: '获取数据失败，请稍后重试' },
      { status: 500 }
    );
  }
}
