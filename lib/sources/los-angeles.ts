/**
 * LA County Public Health — Food Facility Inspections
 *
 * Dataset: https://data.lacounty.gov/resource/cqzw-bncn.json （需核实 resource id）
 * 字段（LA 健康部门 Socrata 数据集常见 schema）：
 *   facility_name
 *   facility_address / facility_city / facility_zip
 *   pe_number —— 稳定 facility id
 *   program_name / program_status
 *   activity_date —— inspection date
 *
 * 灰度：默认 enabled=false，核实端点/字段后开启
 */

import type { FoodDataSource, NormalizedDraft } from './types';
import { fetchSocrata, toSourceFetchResult } from './socrata';
import { buildCuisineLabel, pickText, snapshotSourceRaw } from '@/lib/bay-area-food-import/shared';

const ENDPOINT = 'https://data.lacounty.gov/resource/cqzw-bncn.json';
const FETCH_LIMIT = 300;

function normalizeRow(row: Record<string, unknown>): NormalizedDraft | null {
  const name = pickText(row.facility_name) ?? pickText(row.name);
  if (!name || name.length < 2) return null;

  const externalId =
    pickText(row.pe_number) ??
    pickText(row.facility_id) ??
    pickText(row.program_element);

  const inspectionDate =
    pickText(row.activity_date) ?? pickText(row.inspection_date);

  const city = pickText(row.facility_city) ?? pickText(row.city) ?? 'Los Angeles';
  const address = pickText(row.facility_address) ?? pickText(row.address);
  const programName = pickText(row.program_name);

  return {
    external_id: externalId,
    name,
    address,
    phone: null,
    cuisine_type: buildCuisineLabel({
      licLine: programName,
      businessName: name,
    }),
    city,
    metro_area: 'la',
    source: 'la_county_dph',
    license_date: inspectionDate ? String(inspectionDate).split('T')[0] : null,
    first_inspection_date: inspectionDate ? String(inspectionDate).split('T')[0] : null,
    license_type: programName,
    source_raw: snapshotSourceRaw(row),
    lead_status: 'new',
  };
}

export const losAngelesSource: FoodDataSource = {
  id: 'la_county_dph',
  label: 'LA County Public Health Food Facility Inspections',
  metro: 'la',
  state: 'CA',
  kind: 'inspection',
  portalUrl: 'https://data.lacounty.gov/',
  rateLimit: { rps: 5 },
  enabled: false,

  async fetchAndNormalize({ sinceDate }) {
    const where = `activity_date >= '${sinceDate}T00:00:00'`;
    const res = await fetchSocrata({
      endpoint: ENDPOINT,
      where,
      limit: FETCH_LIMIT,
      order: 'activity_date DESC',
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

export { normalizeRow as _laNormalizeRowForTests };
