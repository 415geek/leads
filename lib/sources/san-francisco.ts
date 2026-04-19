/**
 * SF DataSF g8m3-pdis adapter
 *
 * 底层 fetch + 字段抽取保留在 lib/bay-area-food-import/san-francisco.ts，本文件只：
 *   1. 把 FoodLeadDraft 映射为 NormalizedDraft（加 external_id / metro_area / first_inspection_date）
 *   2. 实现 FoodDataSource interface
 *
 * external_id 选用 source_raw.uniqueid（DataSF 内稳定键）。
 */

import { fetchSanFranciscoFoodLeads } from '@/lib/bay-area-food-import/san-francisco';
import type { FoodDataSource, NormalizedDraft } from './types';
import { pickText } from '@/lib/bay-area-food-import/shared';

export const sanFranciscoSource: FoodDataSource = {
  id: 'sf_gov',
  label: 'DataSF g8m3-pdis（湾区实地城市 · SF 税务登记，近 location_start_date）',
  metro: 'sf_bay',
  state: 'CA',
  kind: 'registration',
  portalUrl: 'https://data.sfgov.org/',
  rateLimit: { rps: 3 },
  enabled: true,

  async fetchAndNormalize({ sinceDate }) {
    const { result, leads } = await fetchSanFranciscoFoodLeads(sinceDate);
    const drafts: NormalizedDraft[] = leads.map((l) => {
      const raw = l.source_raw as Record<string, unknown>;
      const externalId =
        pickText(raw.uniqueid) ??
        pickText(raw.certificate_number) ??
        pickText(raw.ttxid);
      return {
        external_id: externalId,
        name: l.name,
        address: l.address,
        phone: l.phone,
        cuisine_type: l.cuisine_type,
        city: l.city,
        metro_area: 'sf_bay',
        source: l.source,
        license_date: l.license_date,
        // registration 类：license_date 就是登记日期，不需要 first_inspection_date
        first_inspection_date: null,
        license_type: l.license_type,
        source_raw: l.source_raw,
        lead_status: 'new',
      };
    });
    return { result, drafts };
  },
};
