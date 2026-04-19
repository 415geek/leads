/**
 * Houston HDHHS Last Facility Inspection adapter
 *
 * kind: inspection —— 对 inspection 类数据源，license_date = inspection_date（最早那次近似"首检日"）。
 * 当前底层 fetch 返回的是"最近一次"检查日（按 INSPECTION DATE DESC 取 TOP），所以 first_inspection_date
 * 暂以同一字段填入；待 Phase 3 加入历史拉取后再按 MIN(inspection_date) 纠正。
 *
 * external_id：HDHHS 行内没有稳定业务 ID，用 (name + address) 组合 hash 作为兜底。
 */

import { fetchHoustonFoodLeads } from '@/lib/houston-food-import/houston';
import type { FoodDataSource, NormalizedDraft } from './types';
import { pickText } from '@/lib/bay-area-food-import/shared';

function stableId(name: string, address: string | null): string {
  const s = `${name.toLowerCase()}|${(address || '').toLowerCase()}`;
  // 简单哈希（不需要密码学安全），只为 external_id 稳定
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return `hou_${Math.abs(h)}`;
}

export const houstonSource: FoodDataSource = {
  id: 'houston_hdhhs',
  label: 'Houston data.houstontx.gov · HDHHS Last Facility Inspection（CKAN datastore SQL）',
  metro: 'houston',
  state: 'TX',
  kind: 'inspection',
  portalUrl: 'https://data.houstontx.gov/',
  rateLimit: { rps: 2 },
  enabled: true,

  async fetchAndNormalize() {
    const { result, leads } = await fetchHoustonFoodLeads();
    const drafts: NormalizedDraft[] = leads.map((l) => {
      const raw = l.source_raw as Record<string, unknown>;
      const peNum = pickText(raw['PE#']) ?? pickText(raw['PE NO']) ?? pickText(raw['PE']);
      const externalId = peNum ?? stableId(l.name, l.address);
      return {
        external_id: externalId,
        name: l.name,
        address: l.address,
        phone: l.phone,
        cuisine_type: l.cuisine_type,
        city: l.city,
        metro_area: 'houston',
        source: l.source,
        license_date: l.license_date,
        // inspection 类：first_inspection_date 由 pipeline 侧累积；本次先填当前 inspection 日
        first_inspection_date: l.license_date,
        license_type: l.license_type,
        source_raw: l.source_raw,
        lead_status: 'new',
      };
    });
    return { result, drafts };
  },
};
