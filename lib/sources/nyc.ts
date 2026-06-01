/**
 * NYC DOHMH Restaurant Inspection Results
 *
 * Dataset: https://data.cityofnewyork.us/resource/43nn-pn8j.json
 * Schema 要点（以 Socrata 列名为准）：
 *   camis               —— 稳定 facility ID（external_id）
 *   dba                 —— business DBA name
 *   boro                —— MANHATTAN / BROOKLYN / QUEENS / BRONX / STATEN ISLAND
 *   building + street + zipcode —— address parts
 *   phone
 *   cuisine_description —— 菜系原始文本（"Chinese", "Pizza", ...）
 *   inspection_date     —— 检查日（lookback 默认 90 天）
 *   inspection_type     —— Pre-permit / Cycle 等（见 lib/nyc-opening-intel.ts）
 *
 * 默认仅拉 Pre-permit 检查（新店线索）；NYC_INCLUDE_CYCLE_INSPECTIONS=1 时含 Cycle 年检。
 */

import type { FoodDataSource, NormalizedDraft } from './types';
import { fetchSocrata, toSourceFetchResult } from './socrata';
import { buildCuisineLabel, pickText, snapshotSourceRaw } from '@/lib/bay-area-food-import/shared';
import {
  buildNycInspectionWhere,
  dedupeNycRowsByCamis,
  nycIncludeCycleInspections,
  parseNycInspectionType,
} from '@/lib/nyc-opening-intel';

const ENDPOINT = 'https://data.cityofnewyork.us/resource/43nn-pn8j.json';
const FETCH_LIMIT = 500;

const BORO_TO_CITY: Record<string, string> = {
  MANHATTAN: 'Manhattan',
  BROOKLYN: 'Brooklyn',
  QUEENS: 'Queens',
  BRONX: 'Bronx',
  'STATEN ISLAND': 'Staten Island',
};

function buildAddress(row: Record<string, unknown>): string | null {
  const building = pickText(row.building);
  const street = pickText(row.street);
  const boro = pickText(row.boro);
  const zip = pickText(row.zipcode);
  const line1 = [building, street].filter(Boolean).join(' ');
  const parts = [line1, BORO_TO_CITY[String(boro || '').toUpperCase()] || boro, 'NY', zip]
    .filter(Boolean)
    .map(String);
  return parts.length ? parts.join(', ') : null;
}

function normalizeRow(row: Record<string, unknown>): NormalizedDraft | null {
  const dba = pickText(row.dba);
  if (!dba || dba.length < 2) return null;

  const cuisineRaw = pickText(row.cuisine_description);
  if (!cuisineRaw) return null;

  const camis = pickText(row.camis);
  const inspectionDate = pickText(row.inspection_date);
  const city = BORO_TO_CITY[String(row.boro || '').toUpperCase()] || 'New York';
  const inspectionTypeRaw = pickText(row.inspection_type);
  const nyc_opening = parseNycInspectionType(inspectionTypeRaw);

  if (!nycIncludeCycleInspections() && !nyc_opening.is_pre_permit) {
    return null;
  }

  return {
    external_id: camis,
    name: dba,
    address: buildAddress(row),
    phone: pickText(row.phone),
    cuisine_type: buildCuisineLabel({
      licLine: cuisineRaw,
      businessName: dba,
    }),
    city,
    metro_area: 'nyc',
    source: 'nyc_dohmh',
    license_date: inspectionDate ? String(inspectionDate).split('T')[0] : null,
    first_inspection_date: inspectionDate ? String(inspectionDate).split('T')[0] : null,
    license_type: inspectionTypeRaw,
    source_raw: snapshotSourceRaw(row),
    lead_status: 'new',
    nyc_opening,
  };
}

export const nycSource: FoodDataSource = {
  id: 'nyc_dohmh',
  label: 'NYC DOHMH · Pre-permit 新店检查（Socrata 43nn-pn8j）',
  metro: 'nyc',
  state: 'NY',
  kind: 'inspection',
  portalUrl: 'https://data.cityofnewyork.us/',
  rateLimit: { rps: 5 },
  enabled: true,
  lookbackDays: 90,

  async fetchAndNormalize({ sinceDate }) {
    const where = buildNycInspectionWhere(sinceDate);
    const res = await fetchSocrata({
      endpoint: ENDPOINT,
      where,
      limit: FETCH_LIMIT,
      order: 'inspection_date DESC',
    });

    const deduped = dedupeNycRowsByCamis(res.rows);
    const drafts: NormalizedDraft[] = [];
    for (const row of deduped) {
      const d = normalizeRow(row);
      if (d) drafts.push(d);
    }

    drafts.sort(
      (a, b) =>
        (a.nyc_opening?.priority_rank ?? 99) - (b.nyc_opening?.priority_rank ?? 99),
    );

    return {
      result: toSourceFetchResult(this.id, this.label, res, drafts.length),
      drafts,
    };
  },
};

export { normalizeRow as _nycNormalizeRowForTests };
