/**
 * Austin Restaurant Inspection Scores
 *
 * Dataset: https://data.austintexas.gov/resource/ecmv-9xxi.json
 * 字段：
 *   restaurant_name
 *   address
 *   zip_code
 *   inspection_date
 *   score
 *   facility_id —— external_id（注意：此数据集可能没有稳定 id，视情况回落到 name+address hash）
 */

import type { FoodDataSource, NormalizedDraft } from './types';
import { fetchSocrata, toSourceFetchResult } from './socrata';
import { buildCuisineLabel, pickText, snapshotSourceRaw } from '@/lib/bay-area-food-import/shared';

const ENDPOINT = 'https://data.austintexas.gov/resource/ecmv-9xxi.json';
const FETCH_LIMIT = 300;

function stableId(name: string, address: string | null): string {
  const s = `${name.toLowerCase()}|${(address || '').toLowerCase()}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return `aus_${Math.abs(h)}`;
}

function normalizeRow(row: Record<string, unknown>): NormalizedDraft | null {
  const name = pickText(row.restaurant_name);
  if (!name || name.length < 2) return null;

  const addr = pickText(row.address);
  const inspectionDate = pickText(row.inspection_date);
  const fid = pickText(row.facility_id);
  const externalId = fid ?? stableId(name, addr);

  return {
    external_id: externalId,
    name,
    address: addr,
    phone: null,
    cuisine_type: buildCuisineLabel({
      businessName: name,
    }),
    city: 'Austin',
    metro_area: 'austin',
    source: 'austin_inspect',
    license_date: inspectionDate ? String(inspectionDate).split('T')[0] : null,
    first_inspection_date: inspectionDate ? String(inspectionDate).split('T')[0] : null,
    license_type: 'Restaurant',
    source_raw: snapshotSourceRaw(row),
    lead_status: 'new',
  };
}

export const austinSource: FoodDataSource = {
  id: 'austin_inspect',
  label: 'Austin Restaurant Inspection Scores (Socrata ecmv-9xxi)',
  metro: 'austin',
  state: 'TX',
  kind: 'inspection',
  portalUrl: 'https://data.austintexas.gov/',
  rateLimit: { rps: 5 },
  enabled: true,
  // Austin 政府方发布节奏偏慢（典型滞后 30–45 天），用 90 天窗口避免任何天的拉取出现 0 命中。
  lookbackDays: 90,

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

export { normalizeRow as _austinNormalizeRowForTests };
