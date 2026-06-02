import { supabaseAdmin } from '@/lib/supabase';
import { cityFilterOrClause } from '@/lib/lead-city';
import { collectCitiesFromLeadRows, type LeadCityRow } from '@/lib/lead-city';
import { parseIsoDateParam } from '@/lib/leads-date-filter';
import { sourceIdsForRegion, type LeadRegionFilterId } from '@/lib/region-config';
import { extractLatLngFromSourceRaw } from '@/lib/geo-from-source-raw';
import { resolveFilingPortalConfig } from '@/lib/filing-portal-config';
import { dashboardBusinessSearchHref } from '@/lib/dashboard-business-search';
import type { LeadFilters } from '@/types/lead';
import type { LeadMapMarker } from '@/types/lead-map';
import type { LeadStatus } from '@/types/lead';

export interface ListLeadsParams {
  page?: number;
  limit?: number;
  status?: LeadFilters['status'];
  city?: string | null;
  region?: LeadRegionFilterId | null;
  cuisine_type?: string | null;
  min_score?: number | null;
  min_confidence?: number | null;
  chinese_only?: boolean;
  hide_chains?: boolean;
  search?: string | null;
  date_from?: string | null;
  date_to?: string | null;
  sort?: string;
  order?: 'asc' | 'desc';
}

export async function listLeads(params: ListLeadsParams) {
  const page = params.page ?? 1;
  const limit = Math.min(Math.max(params.limit ?? 25, 1), 100);
  const sortBy = params.sort || 'lead_score';
  const sortOrder = params.order || 'desc';

  let query = supabaseAdmin.from('leads').select('*', { count: 'exact' });

  if (params.status) {
    query = query.eq('lead_status', params.status);
  }
  if (params.region && params.region !== 'all') {
    const srcIds = sourceIdsForRegion(params.region);
    if (srcIds && srcIds.length > 0) {
      query = query.in('source', srcIds);
    }
  }
  if (params.city) {
    query = query.or(cityFilterOrClause(params.city));
  }
  if (params.cuisine_type) {
    query = query.ilike('cuisine_type', `%${params.cuisine_type}%`);
  }
  if (params.min_score != null) {
    query = query.gte('lead_score', params.min_score);
  }
  if (params.min_confidence != null && !Number.isNaN(params.min_confidence)) {
    query = query.or(
      `is_restaurant_confidence.gte.${params.min_confidence},is_restaurant_confidence.is.null`,
    );
  }
  if (params.chinese_only) {
    query = query.in('cuisine_type', ['中餐', '川菜', '粤菜', '湘菜', '台湾菜', '东北菜']);
  }
  if (params.hide_chains) {
    query = query.or('is_chain.is.null,is_chain.eq.false');
  }
  if (params.search) {
    query = query.or(`name.ilike.%${params.search}%,address.ilike.%${params.search}%`);
  }
  if (params.date_from) {
    query = query.gte('license_date', params.date_from);
  }
  if (params.date_to) {
    query = query.lte('license_date', params.date_to);
  }

  query = query
    .order(sortBy, { ascending: sortOrder === 'asc' })
    .range((page - 1) * limit, page * limit - 1);

  const { data, error, count } = await query;
  if (error) throw error;

  return {
    data: data ?? [],
    pagination: {
      page,
      limit,
      total: count || 0,
      totalPages: Math.ceil((count || 0) / limit),
    },
  };
}

export function parseListLeadsFromSearchParams(
  searchParams: URLSearchParams,
): ListLeadsParams {
  const chineseOnly = searchParams.get('chinese_only');
  const hideChains = searchParams.get('hide_chains');
  const minConfRaw = searchParams.get('min_confidence');
  const minScoreRaw = searchParams.get('min_score');

  return {
    page: parseInt(searchParams.get('page') || '1', 10),
    limit: parseInt(searchParams.get('limit') || '25', 10),
    status: (searchParams.get('status') as LeadFilters['status']) || undefined,
    city: searchParams.get('city'),
    region: (searchParams.get('region') as LeadRegionFilterId) || undefined,
    cuisine_type: searchParams.get('cuisine_type'),
    min_score: minScoreRaw ? parseInt(minScoreRaw, 10) : null,
    min_confidence: minConfRaw ? parseFloat(minConfRaw) : null,
    chinese_only: chineseOnly === '1' || chineseOnly === 'true',
    hide_chains: hideChains === '1' || hideChains === 'true',
    search: searchParams.get('search'),
    date_from: parseIsoDateParam(searchParams.get('date_from')),
    date_to: parseIsoDateParam(searchParams.get('date_to')),
    sort: searchParams.get('sort') || 'lead_score',
    order: (searchParams.get('order') === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc',
  };
}

export async function getLeadById(id: string) {
  const { data, error } = await supabaseAdmin.from('leads').select('*').eq('id', id).single();

  if (error) {
    if (error.code === 'PGRST116') return { lead: null, filing_portal: null, links: null };
    throw error;
  }

  const filing_portal = resolveFilingPortalConfig({
    metro_area: data.metro_area,
    source: data.source,
    city: data.city,
    address: data.address,
  });

  const links = {
    detail_path: `/leads/${data.id}`,
    dashboard_business_search_path: dashboardBusinessSearchHref(data.name, data.city),
    filing_portal_search_url: filing_portal.searchUrl,
  };

  return { lead: data, filing_portal, links };
}

export async function listLeadFilings(leadId: string) {
  const { data, error } = await supabaseAdmin
    .from('lead_filings')
    .select('*')
    .eq('lead_id', leadId)
    .order('filed_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

const CITIES_PAGE_SIZE = 1000;
const CITIES_MAX_PAGES = 8;

export async function listLeadCities(region: LeadRegionFilterId, q?: string) {
  const srcIds = sourceIdsForRegion(region);
  const rows: LeadCityRow[] = [];

  for (let page = 0; page < CITIES_MAX_PAGES; page++) {
    let query = supabaseAdmin
      .from('leads')
      .select('city, address')
      .range(page * CITIES_PAGE_SIZE, (page + 1) * CITIES_PAGE_SIZE - 1);

    if (srcIds && srcIds.length > 0) {
      query = query.in('source', srcIds);
    }

    const { data, error } = await query;
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...(data as LeadCityRow[]));
    if (data.length < CITIES_PAGE_SIZE) break;
  }

  let cities = collectCitiesFromLeadRows(rows, region);
  const qNorm = q?.trim().toLowerCase() ?? '';
  if (qNorm) {
    cities = cities.filter((c) => c.toLowerCase().includes(qNorm));
  }

  return { cities, scanned: rows.length, region };
}

const MAP_MAX_ROWS = 800;

export async function listMapMarkers() {
  const { data, error } = await supabaseAdmin
    .from('leads')
    .select('id, name, address, city, license_date, lead_score, lead_status, source_raw')
    .order('lead_score', { ascending: false })
    .limit(MAP_MAX_ROWS);

  if (error) throw error;

  const rows = data ?? [];
  const markers: LeadMapMarker[] = [];
  let skippedNoCoords = 0;

  for (const row of rows) {
    const ll = extractLatLngFromSourceRaw(row.source_raw);
    if (!ll) {
      skippedNoCoords++;
      continue;
    }
    markers.push({
      id: row.id,
      name: row.name,
      address: row.address,
      city: row.city,
      license_date: row.license_date ?? null,
      lead_score: row.lead_score,
      lead_status: row.lead_status as LeadStatus,
      lat: ll.lat,
      lng: ll.lng,
    });
  }

  return { markers, scanned: rows.length, skipped_no_coords: skippedNoCoords };
}
