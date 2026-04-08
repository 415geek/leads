import type { LeadSourceRaw } from '@/types/lead';
import { buildBayAreaCityUpperInListSoql } from './bay-area-cities-data-sf';

/** 与 SF 导入一致：近 N 天 + 单次上限 */
export const LOOKBACK_DAYS = 30;
export const FETCH_LIMIT = 500;
/** DataSF g8m3 覆盖全湾区白名单城市后，近期餐饮行数可能更多 */
export const SF_G8M3_FETCH_LIMIT = 1200;

export function pickText(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'string') {
    const t = v.trim();
    return t.length ? t : null;
  }
  return null;
}

export function snapshotSourceRaw(record: Record<string, unknown>): LeadSourceRaw {
  return JSON.parse(JSON.stringify(record)) as LeadSourceRaw;
}

function isChinese(text: string): boolean {
  const chineseKeywords = [
    'chinese', 'china', 'asian', 'dim sum', 'dumpling', 'noodle', 'wok',
    'szechuan', 'sichuan', 'cantonese', 'mandarin', 'hunan', 'shanghai',
    '中餐', '中国', '粤菜', '川菜', '湘菜', '东北', '饺子', '面', '烧烤',
    'taiwan', 'taiwanese', 'hong kong', 'beijing', 'peking',
  ];
  const lowerText = text.toLowerCase();
  return chineseKeywords.some((keyword) => lowerText.includes(keyword));
}

/** SF + Berkeley 共用的业态标签（执照描述 / NAICS 文本 + 店名） */
export function buildCuisineLabel(parts: {
  naicsLine?: string | null;
  licLine?: string | null;
  businessName?: string | null;
  dba?: string | null;
}): string {
  const desc = `${parts.naicsLine || ''} ${parts.licLine || ''}`;
  const name = `${parts.businessName || ''} ${parts.dba || ''}`;

  if (isChinese(desc) || isChinese(name)) {
    const d = desc.toLowerCase();
    if (d.includes('szechuan') || d.includes('sichuan')) return '川菜';
    if (d.includes('cantonese')) return '粤菜';
    if (d.includes('hunan')) return '湘菜';
    if (d.includes('taiwan')) return '台湾菜';
    if (name.includes('饺子') || d.includes('dumpling')) return '东北菜';
    return '中餐';
  }

  const naics = parts.naicsLine?.trim();
  if (naics) return naics.length > 120 ? `${naics.slice(0, 117)}…` : naics;

  const lic = parts.licLine?.trim();
  if (lic) return lic.length > 120 ? `${lic.slice(0, 117)}…` : lic;

  return '餐饮';
}

export function buildSfFoodServiceWhereClause(sinceDate: string): string {
  const citiesIn = buildBayAreaCityUpperInListSoql();
  const food =
    `naic_code like '722%' ` +
    `OR naic_code like '%722%' ` +
    `OR naic_code_description like '%Food Service%' ` +
    `OR naic_code_description like '%Restaurant%' ` +
    `OR naic_code_description like '%Drinking%' ` +
    `OR naic_code_description like '%Cater%' ` +
    `OR lic_code_description like '%RESTAURANT%' ` +
    `OR lic_code_description like '%TAVERN%' ` +
    `OR lic_code_description like '%FOOD PREP%' ` +
    `OR lic_code_description like '%MOBILE FOOD%' ` +
    `OR lic_code_description like '%CATER%' ` +
    `OR lic_code_description like '%CAFETERIA%' ` +
    `OR lic_code_description like '%SHARED KITCHEN%' ` +
    `OR lic_code_description like '%BAKERY%' ` +
    `OR lic_code_description like '%CAFE%' ` +
    `OR lic_code_description like '%EATING PLACE%' ` +
    `OR lic_code_description like '%DINING%'`;

  return (
    `state = 'CA' ` +
    `AND upper(trim(city)) in (${citiesIn}) ` +
    `AND location_start_date >= '${sinceDate}' ` +
    `AND (${food})`
  );
}

/** Berkeley：执照快照，无「新登记日期」字段；筛伯克利市内餐饮相关业态 */
export function buildBerkeleyFoodWhereClause(): string {
  const inBerkeley = `(upper(b1_situs_city) = 'BERKELEY' OR upper(b1_city) = 'BERKELEY')`;
  const food =
    `starts_with(naics, '722') ` +
    `OR upper(busdesc) like '%RESTAURANT%' ` +
    `OR upper(busdesc) like '%CAFE%' ` +
    `OR upper(busdesc) like '%CAFETERIA%' ` +
    `OR upper(busdesc) like '%CATER%' ` +
    `OR upper(busdesc) like '%FOOD TRUCK%' ` +
    `OR upper(busdesc) like '%MOBILE FOOD%' ` +
    `OR upper(busdesc) like '%BAKERY%' ` +
    `OR upper(busdesc) like '%TAVERN%' ` +
    `OR upper(busdesc) like '%BREWERY%' ` +
    `OR upper(busdesc) like '%BAR %' ` +
    `OR upper(busdesc) like '%EATING PLACE%' ` +
    `OR upper(busdesc) like '%WINERY%'`;

  return `${inBerkeley} AND (${food})`;
}

export type FoodLeadDraft = {
  name: string;
  address: string | null;
  phone: string | null;
  cuisine_type: string;
  city: string;
  source: string;
  license_date: string | null;
  license_type: string | null;
  source_raw: LeadSourceRaw;
  lead_status: 'new';
};

export type SourceFetchResult = {
  id: string;
  label: string;
  ok: boolean;
  fetched: number;
  error?: string;
};
