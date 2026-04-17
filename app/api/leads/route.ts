import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { LeadFilters } from '@/types/lead';
import type { LeadRegionId } from '@/lib/region-config';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '25');
    const status = searchParams.get('status') as LeadFilters['status'];
    const city = searchParams.get('city');
    const region = searchParams.get('region') as LeadRegionId | 'all' | null;
    const cuisineType = searchParams.get('cuisine_type');
    const minScore = searchParams.get('min_score');
    const search = searchParams.get('search');
    const sortBy = searchParams.get('sort') || 'lead_score';
    const sortOrder = searchParams.get('order') || 'desc';

    let query = supabaseAdmin
      .from('leads')
      .select('*', { count: 'exact' });

    if (status) {
      query = query.eq('lead_status', status);
    }
    if (region === 'bay_area') {
      query = query.in('source', ['sf_gov', 'berkeley_open_data']);
    } else if (region === 'houston') {
      query = query.eq('source', 'houston_hdhhs');
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
