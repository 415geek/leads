/**
 * Berkeley Open Data adapter
 *
 * external_id 用 source_raw.recordid（rwnf-bu3w 数据集内稳定键）。
 * kind: permit（当前有效执照快照，无登记日期）—— license_date=null，评分会降权。
 */

import { fetchBerkeleyFoodLeads } from '@/lib/bay-area-food-import/berkeley';
import type { FoodDataSource, NormalizedDraft } from './types';
import { pickText } from '@/lib/bay-area-food-import/shared';

export const berkeleySource: FoodDataSource = {
  id: 'berkeley_open_data',
  label: 'Berkeley（有效执照快照 · Business Licenses rwnf-bu3w）',
  metro: 'sf_bay',
  state: 'CA',
  kind: 'permit',
  portalUrl: 'https://data.cityofberkeley.info/',
  rateLimit: { rps: 3 },
  enabled: true,

  async fetchAndNormalize() {
    const { result, leads } = await fetchBerkeleyFoodLeads();
    const drafts: NormalizedDraft[] = leads.map((l) => {
      const raw = l.source_raw as Record<string, unknown>;
      const externalId = pickText(raw.recordid);
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
        first_inspection_date: null,
        license_type: l.license_type,
        source_raw: l.source_raw,
        lead_status: 'new',
      };
    });
    return { result, drafts };
  },
};
