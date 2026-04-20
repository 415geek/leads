/**
 * Los Angeles County — Environmental Health Restaurant & Market Inspections
 *
 * 县门户 ArcGIS FeatureServer（季度切片）。默认导入策略：**新设施近似** ——
 * 仅保留「本数据集内该 FACILITY_ID 的最早 ACTIVITY_DATE（首次检查）落在 lookback 窗口内」的记录，
 * 避免把「老店的例行复检 / 续牌」误当成新线索（与执照日期为最近检查日的假阳性）。
 *
 * 切换策略：环境变量 LA_COUNTY_IMPORT_STRATEGY=recent_inspections 恢复旧行为（任意近期检查活动）。
 *
 * Item: https://www.arcgis.com/home/item.html?id=6f43163a4ca74aad8ad73ea94f14a5b4
 */

import type { FoodDataSource, NormalizedDraft, SourceFetchResult } from './types';
import { buildCuisineLabel, pickText, snapshotSourceRaw } from '@/lib/bay-area-food-import/shared';

/** Portal item → Feature Service base URL（服务每季度可能换名，item id 较稳定） */
export const LA_COUNTY_RESTAURANT_INSPECTION_ITEM_ID =
  '6f43163a4ca74aad8ad73ea94f14a5b4';

const FALLBACK_FEATURE_QUERY_BASE =
  'https://services.arcgis.com/RmCCgQtiZLDCtblq/arcgis/rest/services/Environmental_Health_Restaurant_and_Market_Inspections_04012023_to_033120026/FeatureServer/0/query';

/** 新设施模式：聚合分页每页条数 */
const AGG_PAGE_SIZE = 400;
/** 详情查询每批 FACILITY_ID 数量 */
const DETAIL_BATCH = 80;
const FETCH_LIMIT = 300;

export type LaImportStrategy = 'new_facilities' | 'recent_inspections';

function getLaImportStrategy(): LaImportStrategy {
  const v = process.env.LA_COUNTY_IMPORT_STRATEGY?.trim().toLowerCase();
  if (v === 'recent_inspections') return 'recent_inspections';
  return 'new_facilities';
}

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

function sinceDateToUtcMs(day: string): number {
  const d = new Date(`${day}T00:00:00.000Z`);
  return d.getTime();
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

function escapeSqlLiteral(s: string): string {
  return s.replace(/'/g, "''");
}

/** 旧策略：任意近期检查行（易产生「老店复检」假阳性） */
async function fetchArcgisRecentInspectionRows(args: {
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

type LaAggregate = {
  facility_id: string;
  first_act_ms: number;
  last_act_ms: number;
  cnt: number;
};

async function fetchAggregatePage(args: {
  queryUrl: string;
  resultOffset: number;
  fetchImpl: typeof fetch;
}): Promise<{ ok: boolean; rows: LaAggregate[]; error?: string }> {
  const stats = [
    { statisticType: 'min', onStatisticField: 'ACTIVITY_DATE', outStatisticFieldName: 'first_act' },
    { statisticType: 'max', onStatisticField: 'ACTIVITY_DATE', outStatisticFieldName: 'last_act' },
    { statisticType: 'count', onStatisticField: 'ObjectId', outStatisticFieldName: 'cnt' },
  ];
  const params = new URLSearchParams({
    f: 'json',
    where: "UPPER(PE_DESCRIPTION) LIKE '%RESTAURANT%'",
    groupByFieldsForStatistics: 'FACILITY_ID',
    outStatistics: JSON.stringify(stats),
    orderByFields: 'first_act DESC',
    resultRecordCount: String(AGG_PAGE_SIZE),
    resultOffset: String(args.resultOffset),
  });

  try {
    const res = await args.fetchImpl(`${args.queryUrl}?${params.toString()}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return { ok: false, rows: [], error: `HTTP ${res.status}` };
    const json = (await res.json()) as {
      error?: { message?: string };
      features?: { attributes: Record<string, unknown> }[];
    };
    if (json.error) {
      return { ok: false, rows: [], error: json.error.message ?? 'aggregate error' };
    }
    const out: LaAggregate[] = [];
    for (const f of json.features ?? []) {
      const a = f.attributes;
      const id = pickText(a.FACILITY_ID);
      const fa = typeof a.first_act === 'number' ? a.first_act : null;
      const la = typeof a.last_act === 'number' ? a.last_act : null;
      const cnt = typeof a.cnt === 'number' ? a.cnt : 0;
      if (!id || fa == null || la == null) continue;
      out.push({ facility_id: id, first_act_ms: fa, last_act_ms: la, cnt });
    }
    return { ok: true, rows: out };
  } catch (e) {
    return {
      ok: false,
      rows: [],
      error: e instanceof Error ? e.message : 'aggregate fetch failed',
    };
  }
}

/**
 * 收集「数据集内首次检查日 >= sinceMs」的设施 ID，按 first_act 从新到旧，最多 maxIds 个。
 */
async function collectNewFacilityIds(args: {
  queryUrl: string;
  sinceMs: number;
  maxIds: number;
  fetchImpl: typeof fetch;
  /** 可选：排除本数据集中检查次数过多的（老店）；0 表示不限制 */
  maxInspectionCountInDataset: number;
}): Promise<{ ok: boolean; ids: string[]; aggregates: Map<string, LaAggregate>; error?: string }> {
  const ids: string[] = [];
  const aggregates = new Map<string, LaAggregate>();
  let offset = 0;
  let exhausted = false;

  while (ids.length < args.maxIds && !exhausted) {
    const page = await fetchAggregatePage({
      queryUrl: args.queryUrl,
      resultOffset: offset,
      fetchImpl: args.fetchImpl,
    });
    if (!page.ok) return { ok: false, ids: [], aggregates, error: page.error };
    if (page.rows.length === 0) {
      exhausted = true;
      break;
    }

    for (const row of page.rows) {
      if (row.first_act_ms < args.sinceMs) {
        exhausted = true;
        break;
      }
      if (
        args.maxInspectionCountInDataset > 0 &&
        row.cnt > args.maxInspectionCountInDataset
      ) {
        continue;
      }
      if (!aggregates.has(row.facility_id)) {
        aggregates.set(row.facility_id, row);
        ids.push(row.facility_id);
        if (ids.length >= args.maxIds) break;
      }
    }

    offset += page.rows.length;
    if (page.rows.length < AGG_PAGE_SIZE) exhausted = true;
  }

  return { ok: true, ids, aggregates };
}

async function fetchDetailRowsForFacilityIds(args: {
  queryUrl: string;
  facilityIds: string[];
  fetchImpl: typeof fetch;
}): Promise<{ ok: boolean; rows: Record<string, unknown>[]; error?: string }> {
  if (args.facilityIds.length === 0) return { ok: true, rows: [] };

  const inList = args.facilityIds.map((id) => `'${escapeSqlLiteral(id)}'`).join(',');
  const where = `FACILITY_ID IN (${inList}) AND UPPER(PE_DESCRIPTION) LIKE '%RESTAURANT%'`;
  const params = new URLSearchParams({
    f: 'json',
    where,
    outFields: '*',
    orderByFields: 'FACILITY_ID,ACTIVITY_DATE DESC',
    resultRecordCount: '2000',
  });

  try {
    const res = await args.fetchImpl(`${args.queryUrl}?${params.toString()}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return { ok: false, rows: [], error: `HTTP ${res.status}` };
    const json = (await res.json()) as {
      error?: { message?: string };
      features?: { attributes: Record<string, unknown> }[];
    };
    if (json.error) {
      return { ok: false, rows: [], error: json.error.message ?? 'detail error' };
    }
    const rows = (json.features ?? []).map((f) => f.attributes);
    return { ok: true, rows };
  } catch (e) {
    return {
      ok: false,
      rows: [],
      error: e instanceof Error ? e.message : 'detail fetch failed',
    };
  }
}

/** 每个设施只保留 ACTIVITY_DATE 最新的一行（展示用快照） */
function pickLatestRowPerFacility(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const byId = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const id = pickText(row.FACILITY_ID);
    if (!id) continue;
    const cur = byId.get(id);
    if (!cur) {
      byId.set(id, row);
      continue;
    }
    const a = row.ACTIVITY_DATE;
    const b = cur.ACTIVITY_DATE;
    const am = typeof a === 'number' ? a : 0;
    const bm = typeof b === 'number' ? b : 0;
    if (am > bm) byId.set(id, row);
  }
  return Array.from(byId.values());
}

function normalizeRow(
  row: Record<string, unknown>,
  aggregate?: LaAggregate,
): NormalizedDraft | null {
  const name = pickText(row.FACILITY_NAME);
  if (!name || name.length < 2) return null;

  const pe = pickText(row.PE_DESCRIPTION) ?? '';
  if (!/restaurant/i.test(pe)) return null;

  const externalId = pickText(row.FACILITY_ID) ?? pickText(row.RECORD_ID);
  const latestInspectionIso = activityDateIso(row.ACTIVITY_DATE);

  const cityRaw = pickText(row.FACILITY_CITY);
  const city = titleCaseCity(cityRaw || 'LOS ANGELES');
  const programName = pickText(row.PROGRAM_NAME);

  const firstInDatasetIso = aggregate
    ? activityDateIso(aggregate.first_act_ms)
    : latestInspectionIso;
  const cnt = aggregate?.cnt;

  const rawBase = snapshotSourceRaw(row);
  const source_raw =
    aggregate != null
      ? {
          ...rawBase,
          la_facility_aggregate: {
            dataset_first_activity_ms: aggregate.first_act_ms,
            dataset_last_activity_ms: aggregate.last_act_ms,
            dataset_inspection_row_count: aggregate.cnt,
            latest_activity_ms:
              typeof row.ACTIVITY_DATE === 'number' ? row.ACTIVITY_DATE : null,
          },
        }
      : rawBase;

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
    /** 新设施策略：执照日期用「数据集内首次检查」近似新开业登记 */
    license_date: firstInDatasetIso,
    first_inspection_date: firstInDatasetIso,
    license_type: pe || programName || null,
    source_raw,
    lead_status: 'new',
  };
}

function maxInspectionCountEnv(): number {
  const raw = process.env.LA_COUNTY_NEW_FACILITY_MAX_INSPECTION_ROWS?.trim();
  if (!raw) return 12;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 12;
}

async function fetchNewFacilityInspectionRows(args: {
  sinceDate: string;
  limit: number;
  fetchImpl?: typeof fetch;
}): Promise<{
  ok: boolean;
  rows: Record<string, unknown>[];
  aggregates: Map<string, LaAggregate>;
  error?: string;
}> {
  const fetchImpl = args.fetchImpl ?? globalThis.fetch;
  const day = args.sinceDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return { ok: false, rows: [], aggregates: new Map(), error: 'invalid sinceDate' };
  }
  const sinceMs = sinceDateToUtcMs(day);
  const queryUrl = await resolveFeatureQueryUrl(fetchImpl);

  const collected = await collectNewFacilityIds({
    queryUrl,
    sinceMs,
    maxIds: args.limit,
    fetchImpl,
    maxInspectionCountInDataset: maxInspectionCountEnv(),
  });
  if (!collected.ok) {
    return { ok: false, rows: [], aggregates: new Map(), error: collected.error };
  }
  if (collected.ids.length === 0) {
    return { ok: true, rows: [], aggregates: collected.aggregates };
  }

  const allDetails: Record<string, unknown>[] = [];
  for (let i = 0; i < collected.ids.length; i += DETAIL_BATCH) {
    const batch = collected.ids.slice(i, i + DETAIL_BATCH);
    const det = await fetchDetailRowsForFacilityIds({ queryUrl, facilityIds: batch, fetchImpl });
    if (!det.ok) {
      return { ok: false, rows: [], aggregates: new Map(), error: det.error };
    }
    allDetails.push(...det.rows);
  }

  const latestPer = pickLatestRowPerFacility(allDetails);
  return { ok: true, rows: latestPer, aggregates: collected.aggregates };
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
    'Los Angeles County EH · Restaurant inspections（ArcGIS · 默认仅新设施首次检查窗口）',
  metro: 'la',
  state: 'CA',
  kind: 'inspection',
  portalUrl: 'https://www.arcgis.com/home/item.html?id=6f43163a4ca74aad8ad73ea94f14a5b4',
  rateLimit: { rps: 2 },
  enabled: true,
  lookbackDays: 60,

  async fetchAndNormalize({ sinceDate }) {
    const strategy = getLaImportStrategy();
    let aggMap = new Map<string, LaAggregate>();
    let res: { ok: boolean; rows: Record<string, unknown>[]; error?: string };

    if (strategy === 'new_facilities') {
      const nf = await fetchNewFacilityInspectionRows({ sinceDate, limit: FETCH_LIMIT });
      aggMap = nf.aggregates;
      res = { ok: nf.ok, rows: nf.rows, error: nf.error };
    } else {
      res = await fetchArcgisRecentInspectionRows({ sinceDate, limit: FETCH_LIMIT });
    }

    const drafts: NormalizedDraft[] = [];
    for (const row of res.rows) {
      const fid = pickText(row.FACILITY_ID);
      const agg = fid ? aggMap.get(fid) : undefined;
      const d = normalizeRow(row, strategy === 'new_facilities' ? agg : undefined);
      if (d) drafts.push(d);
    }

    return {
      result: toFetchResult(this.id, this.label, res, drafts.length),
      drafts,
    };
  },
};

export { normalizeRow as _laNormalizeRowForTests };
