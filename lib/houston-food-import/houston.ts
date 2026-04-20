import { calculateLeadScore } from '@/lib/scoring';
import type { Lead } from '@/types/lead';
import {
  buildCuisineLabel,
  pickText,
  snapshotSourceRaw,
  type FoodLeadDraft,
  type SourceFetchResult,
} from '@/lib/bay-area-food-import/shared';

/** City of Houston CKAN — HDHHS「最近一次设施检查」Datastore（食品服务相关业态） */
const HOUSTON_CKN_BASE = 'https://data.houstontx.gov/api/3/action/datastore_search_sql';
/** 默认 resource：Last Facility Inspection as of 2015-05-12（门户侧长期未刷新时可设 HOUSTON_HDHHS_DATASTORE_RESOURCE_ID） */
export const HOUSTON_LAST_INSPECTION_RESOURCE =
  '1587d382-4eb4-441f-a77a-d2eef9d7b208';

const HOUSTON_IMPORT_LIMIT_DEFAULT = 300;

function houstonHdhhsDatastoreResourceId(): string {
  const id = process.env.HOUSTON_HDHHS_DATASTORE_RESOURCE_ID?.trim();
  return id?.length ? id : HOUSTON_LAST_INSPECTION_RESOURCE;
}

function houstonImportLimit(): number {
  const raw = process.env.HOUSTON_HDHHS_IMPORT_LIMIT?.trim();
  if (!raw) return HOUSTON_IMPORT_LIMIT_DEFAULT;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return HOUSTON_IMPORT_LIMIT_DEFAULT;
  return Math.min(5000, Math.max(50, n));
}

function maxIsoDate(dates: readonly (string | null)[]): string | null {
  const xs = dates.filter((d): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d));
  if (!xs.length) return null;
  return xs.reduce((a, b) => (a > b ? a : b));
}

function foodFacilitySqlWhere(): string {
  const f = 'FACILITY TYPE';
  return `(
    "${f}" ILIKE '%Restaurant%' OR
    "${f}" ILIKE '%Bar %' OR
    "${f}" ILIKE '%Cafe%' OR
    "${f}" ILIKE '%Mobile%' OR
    "${f}" ILIKE '%Cater%' OR
    "${f}" ILIKE '%Bakery%' OR
    "${f}" ILIKE '%Tavern%' OR
    "${f}" ILIKE '%Eating Place%' OR
    "${f}" ILIKE '%Food Service%' OR
    "${f}" ILIKE '%School Cafeteria%' OR
    "${f}" ILIKE '%Ice Cream%' OR
    "${f}" ILIKE '%Brewery%' OR
    "${f}" ILIKE '%Winery%'
  )`;
}

function buildAddress(row: Record<string, unknown>): string | null {
  const num = pickText(row['ST. NUM.']);
  const street = pickText(row['ST. NAME']);
  const city = pickText(row['CITY']);
  const state = pickText(row['STATE']);
  const zip = pickText(row['ZIP']);
  const parts = [
    [num, street].filter(Boolean).join(' ').trim(),
    [city, state].filter(Boolean).join(', ').trim(),
    zip,
  ].filter(Boolean);
  const line = parts.join(', ').replace(/^,\s*|,\s*$/g, '').trim();
  return line.length ? line : null;
}

function inspectionDateIso(row: Record<string, unknown>): string | null {
  const raw = pickText(row['INSPECTION DATE']);
  if (!raw) return null;
  const day = raw.split(/[T ]/)[0];
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

type CkanSqlResponse = {
  success?: boolean;
  result?: { records?: Record<string, unknown>[]; error?: string };
  error?: { message?: string };
};

export async function fetchHoustonFoodLeads(): Promise<{
  result: SourceFetchResult;
  leads: (FoodLeadDraft & { lead_score: number })[];
}> {
  const id = 'houston_hdhhs';
  const label =
    'Houston data.houstontx.gov · HDHHS Last Facility Inspection（CKAN datastore SQL）';

  const resourceId = houstonHdhhsDatastoreResourceId();
  const limit = houstonImportLimit();

  const sql = `
    SELECT * FROM "${resourceId}"
    WHERE ${foodFacilitySqlWhere()}
    ORDER BY "INSPECTION DATE" DESC NULLS LAST
    LIMIT ${limit}
  `
    .replace(/\s+/g, ' ')
    .trim();

  try {
    const response = await fetch(HOUSTON_CKN_BASE, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'RestaurantLeadsFinder/1.0 (+https://data.houstontx.gov)',
      },
      body: JSON.stringify({ sql }),
    });

    if (!response.ok) {
      return {
        result: {
          id,
          label,
          ok: false,
          fetched: 0,
          error: `HTTP ${response.status}`,
        },
        leads: [],
      };
    }

    const json = (await response.json()) as CkanSqlResponse;
    if (!json.success || !json.result?.records) {
      const err =
        json.error?.message ||
        json.result?.error ||
        (typeof json === 'object' ? JSON.stringify(json).slice(0, 200) : 'bad response');
      return {
        result: { id, label, ok: false, fetched: 0, error: err },
        leads: [],
      };
    }

    const rows = json.result.records;
    const leads: (FoodLeadDraft & { lead_score: number })[] = [];

    for (const row of rows) {
      const name = pickText(row['NAME']);
      if (!name || name.length < 2) continue;

      const facility = pickText(row['FACILITY TYPE']);
      const permits = pickText(row['PERMIT TYPE(S)']);
      const cuisineType = buildCuisineLabel({
        licLine: [facility, permits].filter(Boolean).join(' · '),
        businessName: name,
      });

      const draft: FoodLeadDraft = {
        name,
        address: buildAddress(row),
        phone: pickText(row['PHONE']),
        cuisine_type: cuisineType,
        city: pickText(row['CITY']) || 'Houston',
        source: 'houston_hdhhs',
        license_date: inspectionDateIso(row),
        license_type: facility || permits || null,
        source_raw: snapshotSourceRaw(row),
        lead_status: 'new',
      };

      leads.push({
        ...draft,
        lead_score: calculateLeadScore(draft as Partial<Lead>),
      });
    }

    const maxLeadDate = maxIsoDate(leads.map((l) => l.license_date));
    const stalePortalWarning =
      maxLeadDate && maxLeadDate < '2020-01-01'
        ? `HDHHS CKAN 检查日期最新为 ${maxLeadDate}（data.houstontx.gov 该 datastore 未更新至近年）。近年工商实体请配置 HARRIS_DBA_JSON_URL / TX_SOS_HOUSTON_JSON_URL；若门户发布新 resource，可设置 HOUSTON_HDHHS_DATASTORE_RESOURCE_ID。`
        : undefined;

    return {
      result: {
        id,
        label,
        ok: true,
        fetched: leads.length,
        ...(stalePortalWarning ? { warning: stalePortalWarning } : {}),
      },
      leads,
    };
  } catch (e) {
    return {
      result: {
        id,
        label,
        ok: false,
        fetched: 0,
        error: e instanceof Error ? e.message : 'fetch failed',
      },
      leads: [],
    };
  }
}
