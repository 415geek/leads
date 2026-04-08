/**
 * 湾区餐饮线索：多市政开放数据聚合。
 *
 * DataSF g8m3-pdis：经 SF 税务登记的企业，实地 `city` 可覆盖九县常见城市（白名单 + CA）；
 * 近 `location_start_date` 仍是最强销售时机信号。
 * Berkeley rwnf-bu3w：市内有效执照快照（无登记日），补伯克利本地执照口径。
 *
 * 其他市专属门户（如 San José CKAN、Oakland 异构目录）可再挂独立 fetcher。
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
