/**
 * Chicago Food Inspections
 *
 * Dataset: https://data.cityofchicago.org/resource/4ijn-s7e5.json
 * 关键字段：
 *   license_ # —— facility license number（external_id）
 *   dba_name
 *   aka_name
 *   facility_type —— 'Restaurant' / 'Grocery Store' / ... （Grocery 由 AI 分类器过滤掉）
 *   address / city / state / zip
 *   inspection_date
 */

import type { FoodDataSource, NormalizedDraft } from './types';
import { fetchSocrata, toSourceFetchResult } from './socrata';
import { buildCuisineLabel, pickText, snapshotSourceRaw } from '@/lib/bay-area-food-import/shared';

const ENDPOINT = 'https://data.cityofchicago.org/resource/4ijn-s7e5.json';
const FETCH_LIMIT = 300;

function normalizeRow(row: Record<string, unknown>): NormalizedDraft | null {
  // Socrata 某些字段 key 含空格/特殊字符；使用多重 fallback
  const dba = pickText(row.dba_name) ?? pickText(row.aka_name);
  if (!dba || dba.length < 2) return null;

  const externalId =
    pickText(row['license_']) ??
    pickText(row.license_) ??
    pickText(row['license_#'] as unknown) ??
    pickText(row.license_number);

  const inspectionDate = pickText(row.inspection_date);
  const facilityType = pickText(row.facility_type);

  return {
    external_id: externalId,
    name: dba,
    address: pickText(row.address),
    phone: null,
    cuisine_type: buildCuisineLabel({
      licLine: facilityType,
      businessName: dba,
    }),
    city: pickText(row.city) ?? 'Chicago',
    metro_area: 'chicago',
    source: 'chicago_food_inspect',
    license_date: inspectionDate ? String(inspectionDate).split('T')[0] : null,
    first_inspection_date: inspectionDate ? String(inspectionDate).split('T')[0] : null,
    license_type: facilityType,
    source_raw: snapshotSourceRaw(row),
    lead_status: 'new',
  };
}

export const chicagoSource: FoodDataSource = {
  id: 'chicago_food_inspect',
  label: 'Chicago Food Inspections (Socrata 4ijn-s7e5)',
  metro: 'chicago',
  state: 'IL',
  kind: 'inspection',
  portalUrl: 'https://data.cityofchicago.org/',
  rateLimit: { rps: 5 },
  enabled: true,

  async fetchAndNormalize({ sinceDate }) {
    const where = `inspection_date >= '${sinceDate}T00:00:00' AND facility_type='Restaurant'`;
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

export { normalizeRow as _chicagoNormalizeRowForTests };
