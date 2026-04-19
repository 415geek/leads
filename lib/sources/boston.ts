/**
 * Boston Food Establishment Inspections (CKAN)
 *
 * Portal: https://data.boston.gov/dataset/food-establishment-inspections
 * Boston 数据门户是 CKAN，不是 Socrata，端点模式不同：
 *   datastore_search: https://data.boston.gov/api/3/action/datastore_search?resource_id=...
 *   datastore_search_sql: https://data.boston.gov/api/3/action/datastore_search_sql
 *
 * 字段（字段名大小写敏感，需以门户为准）：
 *   businessname
 *   address
 *   city
 *   zip
 *   violdttm / inspdttm —— inspection date
 *   licenseno —— license number（external_id）
 *
 * 灰度：默认 enabled=false，核实后开启
 */

import type { FoodDataSource, NormalizedDraft, SourceFetchResult } from './types';
import { buildCuisineLabel, pickText, snapshotSourceRaw } from '@/lib/bay-area-food-import/shared';

const CKAN_BASE = 'https://data.boston.gov/api/3/action/datastore_search_sql';
/** 待核实 resource id —— data.boston.gov 的 food-establishment-inspections 详情页查 */
export const BOSTON_FOOD_RESOURCE = '4a6a3b23-6d6b-4a63-b81e-7fbd3c8c3da5';

function normalizeRow(row: Record<string, unknown>): NormalizedDraft | null {
  const name = pickText(row.businessname) ?? pickText(row.legalowner);
  if (!name || name.length < 2) return null;

  const externalId = pickText(row.licenseno) ?? pickText(row.license_no);
  const inspectionDate = pickText(row.inspdttm) ?? pickText(row.violdttm);
  const city = pickText(row.city) ?? 'Boston';

  return {
    external_id: externalId,
    name,
    address: pickText(row.address),
    phone: null,
    cuisine_type: buildCuisineLabel({ businessName: name }),
    city,
    metro_area: 'boston',
    source: 'boston_food_inspect',
    license_date: inspectionDate ? String(inspectionDate).split('T')[0] : null,
    first_inspection_date: inspectionDate ? String(inspectionDate).split('T')[0] : null,
    license_type: pickText(row.licstatus) ?? 'Food Establishment',
    source_raw: snapshotSourceRaw(row),
    lead_status: 'new',
  };
}

interface CkanSqlResponse {
  success?: boolean;
  result?: { records?: Record<string, unknown>[]; error?: string };
  error?: { message?: string };
}

export const bostonSource: FoodDataSource = {
  id: 'boston_food_inspect',
  label: 'Boston Food Establishment Inspections (CKAN datastore SQL)',
  metro: 'boston',
  state: 'MA',
  kind: 'inspection',
  portalUrl: 'https://data.boston.gov/',
  rateLimit: { rps: 3 },
  enabled: false,

  async fetchAndNormalize({ sinceDate }) {
    const id = this.id;
    const label = this.label;
    const sql = `SELECT * FROM "${BOSTON_FOOD_RESOURCE}" WHERE "inspdttm" >= '${sinceDate}' ORDER BY "inspdttm" DESC LIMIT 1000`;

    try {
      const response = await fetch(CKAN_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ sql }),
      });
      if (!response.ok) {
        const result: SourceFetchResult = {
          id,
          label,
          ok: false,
          fetched: 0,
          error: `HTTP ${response.status}`,
        };
        return { result, drafts: [] };
      }
      const json = (await response.json()) as CkanSqlResponse;
      if (!json.success || !json.result?.records) {
        const err = json.error?.message || json.result?.error || 'bad response';
        const result: SourceFetchResult = { id, label, ok: false, fetched: 0, error: err };
        return { result, drafts: [] };
      }
      const drafts: NormalizedDraft[] = [];
      for (const row of json.result.records) {
        const d = normalizeRow(row);
        if (d) drafts.push(d);
      }
      return {
        result: { id, label, ok: true, fetched: drafts.length },
        drafts,
      };
    } catch (e) {
      const result: SourceFetchResult = {
        id,
        label,
        ok: false,
        fetched: 0,
        error: e instanceof Error ? e.message : 'fetch failed',
      };
      return { result, drafts: [] };
    }
  },
};

export { normalizeRow as _bostonNormalizeRowForTests };
