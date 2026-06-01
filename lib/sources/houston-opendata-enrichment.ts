/**
 * Houston Open Data — 批量补全（HDHHS 检查历史 / CKAN datastore）
 *
 * 优先级 #8：用于 enrich / 补全地址与 PE#，不作为新开业主信号。
 * 与 houston_hdhhs 共用底层 fetch，但独立 source id 便于合并优先级控制。
 */

import { fetchHoustonFoodLeads } from '@/lib/houston-food-import/houston';
import type { FoodDataSource, NormalizedDraft } from './types';
import { pickText } from '@/lib/bay-area-food-import/shared';
import {
  isLikelyHoustonChainName,
  matchesHoustonRestaurantKeyword,
} from '@/lib/houston-opening-intel';

const SOURCE_ID = 'houston_opendata_enrichment';

function stableId(name: string, address: string | null): string {
  const s = `${name.toLowerCase()}|${(address || '').toLowerCase()}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return `hou_od_${Math.abs(h)}`;
}

export const houstonOpendataEnrichmentSource: FoodDataSource = {
  id: SOURCE_ID,
  label: 'Houston Open Data · HDHHS 批量补全（data.houstontx.gov CKAN）',
  metro: 'houston',
  state: 'TX',
  kind: 'inspection',
  portalUrl: 'https://data.houstontx.gov/',
  rateLimit: { rps: 2 },
  enabled: true,
  lookbackDays: 730,

  async fetchAndNormalize(opts) {
    const { result, leads } = await fetchHoustonFoodLeads();
    const drafts: NormalizedDraft[] = [];
    const since = opts.sinceDate;
    for (const l of leads) {
      if (since && l.license_date && l.license_date < since) continue;
      if (isLikelyHoustonChainName(l.name)) continue;
      const nameKw = matchesHoustonRestaurantKeyword(l.name);
      const raw = l.source_raw as Record<string, unknown>;
      const facility = pickText(raw['FACILITY TYPE']) ?? '';
      if (
        process.env.HOUSTON_HDHHS_STRICT_NAME_KEYWORDS === '1' &&
        !nameKw.ok &&
        !/(restaurant|cafe|bakery|grill|bbq|taco|kitchen|bar\b)/i.test(facility)
      ) {
        continue;
      }

      const peNum = pickText(raw['PE#']) ?? pickText(raw['PE NO']) ?? pickText(raw['PE']);
      const externalId = peNum ?? stableId(l.name, l.address);
      drafts.push({
        external_id: externalId,
        name: l.name,
        address: l.address,
        phone: l.phone,
        cuisine_type: l.cuisine_type,
        city: l.city,
        metro_area: 'houston',
        source: SOURCE_ID,
        license_date: l.license_date,
        first_inspection_date: l.license_date,
        license_type: l.license_type,
        source_raw: { ...l.source_raw, _enrichment: true },
        lead_status: 'new',
        houston_opening: {
          display_status: 'health_inspection_facility',
          display_source: 'Open Data Enrichment',
          confidence_score: 'LOW',
          keyword_hits: nameKw.ok ? nameKw.hits : undefined,
        },
      });
    }
    const adjustedResult =
      drafts.length !== leads.length ? { ...result, fetched: drafts.length } : { ...result };
    return {
      result: { ...adjustedResult, id: SOURCE_ID, label: houstonOpendataEnrichmentSource.label },
      drafts,
    };
  },
};
