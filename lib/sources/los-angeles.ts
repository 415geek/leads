/**
 * Los Angeles County — Environmental Health Restaurant & Market Inspections
 *
 * 县门户 data.lacounty.gov 旧 Socrata API 已失效；现行数据托管在 ArcGIS FeatureServer
 *（与公开 CSV/地图同源，季度更新）。通过 ArcGIS Portal item 解析 `url`，避免服务名随季度改名后硬编码失效。
 *
 * Item: https://www.arcgis.com/home/item.html?id=6f43163a4ca74aad8ad73ea94f14a5b4
 *
 * 覆盖全县 85 市 + 非建制区（Pasadena / Long Beach / Vernon 由当地卫生部门管辖，本数据集不含）。
 * metro 仍用 `la`（产品「大洛杉矶」）；仅保留 PE_DESCRIPTION 含 RESTAURANT 的记录。
 */

import type { FoodDataSource, NormalizedDraft, SourceFetchResult } from './types';
import { buildCuisineLabel, pickText, snapshotSourceRaw } from '@/lib/bay-area-food-import/shared';

/** Portal item → Feature Service base URL（服务每季度可能换名，item id 较稳定） */
export const LA_COUNTY_RESTAURANT_INSPECTION_ITEM_ID =
  '6f43163a4ca74aad8ad73ea94f14a5b4';

const FALLBACK_FEATURE_QUERY_BASE =
  'https://services.arcgis.com/RmCCgQtiZLDCtblq/arcgis/rest/services/Environmental_Health_Restaurant_and_Market_Inspections_04012023_to_033120026/FeatureServer/0/query';

const FETCH_LIMIT = 300;

function titleCaseCity(raw: string): string {
  const t = raw.trim();
  if (!t) return 'Los Angeles';
  return t
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function activityDateIso(v: unknown): string | null {
  if (typeof v === 'number' && Number.isFinite(v)) {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  }
  return null;
}

function buildAddress(row: Record<string, unknown>): string | null {
  const line1 = pickText(row.FACILITY_ADDRESS);
  const city = pickText(row.FACILITY_CITY);
  const st = pickText(row.FACILITY_STATE) ?? 'CA';
  const zip = pickText(row.FACILITY_ZIP);
  const cityLine = [city, st, zip].filter(Boolean).join(' ').trim();
  const parts = [line1, cityLine].filter(Boolean);
  const line = parts.join(', ').trim();
  return line.length ? line : null;
}

async function resolveFeatureQueryUrl(fetchImpl: typeof fetch): Promise<string> {
  const metaUrl = `https://www.arcgis.com/sharing/rest/content/items/${LA_COUNTY_RESTAURANT_INSPECTION_ITEM_ID}?f=json`;
  try {
    const res = await fetchImpl(metaUrl);
    if (!res.ok) return FALLBACK_FEATURE_QUERY_BASE;
    const json = (await res.json()) as { url?: string };
    const base = json.url?.replace(/\/$/, '');
    if (base) return `${base}/0/query`;
  } catch {
    /* use fallback */
  }
  return FALLBACK_FEATURE_QUERY_BASE;
}

async function fetchArcgisInspectionRows(args: {
  sinceDate: string;
  limit: number;
  fetchImpl?: typeof fetch;
}): Promise<{ ok: boolean; rows: Record<string, unknown>[]; error?: string }> {
  const fetchImpl = args.fetchImpl ?? globalThis.fetch;
  const queryUrl = await resolveFeatureQueryUrl(fetchImpl);
  const day = args.sinceDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return { ok: false, rows: [], error: 'invalid sinceDate' };
  }

  const where = `ACTIVITY_DATE >= DATE '${day}' AND UPPER(PE_DESCRIPTION) LIKE '%RESTAURANT%'`;
  const params = new URLSearchParams({
    f: 'json',
    where,
    outFields: '*',
    orderByFields: 'ACTIVITY_DATE DESC',
    resultRecordCount: String(args.limit),
  });

  try {
    const res = await fetchImpl(`${queryUrl}?${params.toString()}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      return { ok: false, rows: [], error: `HTTP ${res.status}` };
    }
    const json = (await res.json()) as {
      error?: { message?: string };
      features?: { attributes: Record<string, unknown> }[];
    };
    if (json.error) {
      const msg = json.error.message ?? JSON.stringify(json.error);
      return { ok: false, rows: [], error: msg };
    }
    const rows = (json.features ?? []).map((f) => f.attributes);
    return { ok: true, rows };
  } catch (e) {
    return {
      ok: false,
      rows: [],
      error: e instanceof Error ? e.message : 'fetch failed',
    };
  }
}

function normalizeRow(row: Record<string, unknown>): NormalizedDraft | null {
  const name = pickText(row.FACILITY_NAME);
  if (!name || name.length < 2) return null;

  const pe = pickText(row.PE_DESCRIPTION) ?? '';
  if (!/restaurant/i.test(pe)) return null;

  const externalId = pickText(row.FACILITY_ID) ?? pickText(row.RECORD_ID);
  const inspectionDate = activityDateIso(row.ACTIVITY_DATE);

  const cityRaw = pickText(row.FACILITY_CITY);
  const city = titleCaseCity(cityRaw || 'LOS ANGELES');
  const programName = pickText(row.PROGRAM_NAME);

  return {
    external_id: externalId,
    name,
    address: buildAddress(row),
    phone: null,
    cuisine_type: buildCuisineLabel({
      licLine: [pe, programName].filter(Boolean).join(' · '),
      businessName: name,
    }),
    city,
    metro_area: 'la',
    source: 'lacounty_restaurant_inspect',
    license_date: inspectionDate,
    first_inspection_date: inspectionDate,
    license_type: pe || programName || null,
    source_raw: snapshotSourceRaw(row),
    lead_status: 'new',
  };
}

function toFetchResult(
  id: string,
  label: string,
  res: { ok: boolean; rows: unknown[]; error?: string },
  draftCount: number,
): SourceFetchResult {
  if (!res.ok) {
    return { id, label, ok: false, fetched: 0, error: res.error };
  }
  return { id, label, ok: true, fetched: draftCount };
}

export const losAngelesSource: FoodDataSource = {
  id: 'lacounty_restaurant_inspect',
  label:
    'Los Angeles County EH · Restaurant & Market Inspections（ArcGIS / 季度更新）',
  metro: 'la',
  state: 'CA',
  kind: 'inspection',
  portalUrl: 'https://www.arcgis.com/home/item.html?id=6f43163a4ca74aad8ad73ea94f14a5b4',
  rateLimit: { rps: 2 },
  enabled: true,

  async fetchAndNormalize({ sinceDate }) {
    const res = await fetchArcgisInspectionRows({ sinceDate, limit: FETCH_LIMIT });
    const drafts: NormalizedDraft[] = [];
    for (const row of res.rows) {
      const d = normalizeRow(row);
      if (d) drafts.push(d);
    }

    return {
      result: toFetchResult(this.id, this.label, res, drafts.length),
      drafts,
    };
  },
};

export { normalizeRow as _laNormalizeRowForTests };
