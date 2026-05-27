/**
 * King County Food Establishment Inspections (Seattle area)
 *
 * Dataset: https://data.kingcounty.gov/resource/f29f-zza5.json （需核实 resource id）
 * 字段（按常见 schema，实际列名以数据门户为准）：
 *   name              —— establishment name
 *   address
 *   city
 *   zip_code
 *   inspection_date
 *   program_identifier —— 稳定 facility id
 *
 * ENABLED=false：上线前需在 data.kingcounty.gov 核对 resource id 与字段名。
 * 本文件骨架 + 测试 fixture 已到位；运行前改 enabled:true 并根据实际字段微调 normalizeRow。
 */

import type { FoodDataSource, NormalizedDraft } from './types';
import { fetchSocrata, toSourceFetchResult } from './socrata';
import { buildCuisineLabel, pickText, snapshotSourceRaw } from '@/lib/bay-area-food-import/shared';

// Resource ID f29f-zza5 confirmed against data.kingcounty.gov on 2026-05-09
const ENDPOINT = 'https://data.kingcounty.gov/resource/f29f-zza5.json';
const FETCH_LIMIT = 300;

function normalizeRow(row: Record<string, unknown>): NormalizedDraft | null {
  const name = pickText(row.name);
  if (!name || name.length < 2) return null;

  const city = pickText(row.city) ?? 'Seattle';
  // business_id is the stable facility ID (e.g. PR0089260); program_identifier duplicates name
  const externalId =
    pickText(row.business_id) ??
    pickText(row.program_identifier) ??
    pickText(row.inspection_serial_num);

  const inspectionDate = pickText(row.inspection_date);

  return {
    external_id: externalId,
    name,
    address: pickText(row.address),
    phone: pickText(row.phone),
    cuisine_type: buildCuisineLabel({ businessName: name }),
    city,
    metro_area: 'seattle',
    source: 'king_county_food',
    license_date: inspectionDate ? String(inspectionDate).split('T')[0] : null,
    first_inspection_date: inspectionDate ? String(inspectionDate).split('T')[0] : null,
    license_type: 'Food Establishment',
    source_raw: snapshotSourceRaw(row),
    lead_status: 'new',
  };
}

export const seattleSource: FoodDataSource = {
  id: 'king_county_food',
  label: 'King County Food Establishment Inspections (Socrata f29f-zza5)',
  metro: 'seattle',
  state: 'WA',
  kind: 'inspection',
  portalUrl: 'https://data.kingcounty.gov/',
  rateLimit: { rps: 5 },
  enabled: true,
  // King County 发布节奏极慢（2026-05 时数据集 rowsUpdatedAt 仍停在 2025-12 一带），
  // 用 240 天窗口确保至少能捞回最近一次更新；后续如政府方恢复正常发布，可调回 60 天。
  lookbackDays: 240,

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

export { normalizeRow as _seattleNormalizeRowForTests };
