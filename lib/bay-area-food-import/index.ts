/**
 * 湾区餐饮线索：多市政开放数据聚合。
 *
 * 分析师优先级：SF「新 location_start_date」为最强销售时机信号；
 * Berkeley 为有效执照快照（无登记日），用于覆盖东湾核心城区。
 *
 * Oakland 门户暂无与 SF g8m3-pdis 同级的「新登记 + 餐饮」单表；San José 门户为 CKAN，需另接 API。
 */

export * from './shared';
export { fetchSanFranciscoFoodLeads } from './san-francisco';
export { fetchBerkeleyFoodLeads } from './berkeley';

import { fetchSanFranciscoFoodLeads } from './san-francisco';
import { fetchBerkeleyFoodLeads } from './berkeley';
import { LOOKBACK_DAYS, type FoodLeadDraft, type SourceFetchResult } from './shared';

export type BayAreaImportLead = FoodLeadDraft & { lead_score: number };

export async function runBayAreaFoodImport(): Promise<{
  sinceDate: string;
  sourceResults: SourceFetchResult[];
  leads: BayAreaImportLead[];
}> {
  const since = new Date();
  since.setDate(since.getDate() - LOOKBACK_DAYS);
  const sinceDate = since.toISOString().split('T')[0];

  const [sf, berk] = await Promise.all([
    fetchSanFranciscoFoodLeads(sinceDate),
    fetchBerkeleyFoodLeads(),
  ]);

  const sourceResults = [sf.result, berk.result];
  const leads = [...sf.leads, ...berk.leads];

  return { sinceDate, sourceResults, leads };
}

const CHINESE_TAGS = ['中餐', '川菜', '粤菜', '湘菜', '台湾菜', '东北菜'];

export function countChineseTagged(leads: BayAreaImportLead[]): number {
  return leads.filter((l) => CHINESE_TAGS.includes(l.cuisine_type || '')).length;
}
