/**
 * NYC DOHMH Restaurant Inspection Results
 *
 * Dataset: https://data.cityofnewyork.us/resource/43nn-pn8j.json
 * Schema 要点（以 Socrata 列名为准）：
 *   camis          —— 稳定 facility ID（external_id）
 *   dba            —— business DBA name
 *   boro           —— MANHATTAN / BROOKLYN / QUEENS / BRONX / STATEN ISLAND
 *   building + street + zipcode —— address parts
 *   phone
 *   cuisine_description —— 菜系原始文本（"Chinese", "Pizza", ...）
 *   inspection_date —— 最近一次检查日（lookback 近 30 天 → 新店代理）
 *
 * kind: inspection —— 第一次出现即视为"新店发现"，由 pipeline 的 first_seen_at 把关
 */

import type { FoodDataSource, NormalizedDraft } from './types';
import { fetchSocrata, toSourceFetchResult } from './socrata';
import { buildCuisineLabel, pickText, snapshotSourceRaw } from '@/lib/bay-area-food-import/shared';

const ENDPOINT = 'https://data.cityofnewyork.us/resource/43nn-pn8j.json';
const FETCH_LIMIT = 300;

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

  const camis = pickText(row.camis);
  const cuisineRaw = pickText(row.cuisine_description);
  const inspectionDate = pickText(row.inspection_date);
  const city = BORO_TO_CITY[String(row.boro || '').toUpperCase()] || 'New York';

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
    license_type: cuisineRaw,
    source_raw: snapshotSourceRaw(row),
    lead_status: 'new',
  };
}

export const nycSource: FoodDataSource = {
  id: 'nyc_dohmh',
  label: 'NYC DOHMH Restaurant Inspections (Socrata 43nn-pn8j)',
  metro: 'nyc',
  state: 'NY',
  kind: 'inspection',
  portalUrl: 'https://data.cityofnewyork.us/',
  rateLimit: { rps: 5 },
  enabled: true,

  async fetchAndNormalize({ sinceDate }) {
    const where = `inspection_date >= '${sinceDate}T00:00:00'`;
    const res = await fetchSocrata({
      endpoint: ENDPOINT,
      where,
      limit: FETCH_LIMIT,
      order: 'inspection_date DESC',
    });

    const drafts: NormalizedDraft[] = [];
    for (const row of res.rows) {
      const d = normalizeRow(row);
      if (d) drafts.push(d);
    }

    return {
      result: toSourceFetchResult(this.id, this.label, res, drafts.length),
      drafts,
    };
  },
};

// Export normalizeRow for tests
export { normalizeRow as _nycNormalizeRowForTests };
