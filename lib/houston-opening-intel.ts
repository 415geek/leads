/**
 * 休斯顿多源开业情报：关键词、连锁启发式、地址键、名称相似度。
 * 用于 Harris DBA / TX SOS 补充 JSON、HDHHS 过滤，以及跨源合并。
 */

/** 用户规格中的餐饮关键词（小写匹配） */
export const HOUSTON_RESTAURANT_KEYWORDS = [
  'restaurant',
  'cafe',
  'café',
  'kitchen',
  'grill',
  'bbq',
  'barbecue',
  'boba',
  'tea',
  'sushi',
  'noodles',
  'noodle',
  'ramen',
  'hotpot',
  'hot pot',
  'bakery',
  'dessert',
  'taco',
  'mexican food',
  'cantina',
  'taqueria',
] as const;

/** 明显非餐饮（TX SOS / DBA 名称排除用） */
export const HOUSTON_NON_FOOD_EXCLUSIONS = [
  'consulting',
  'logistics',
  ' trucking',
  'transport',
  'technology',
  'software',
  'real estate',
  'insurance',
  'mortgage',
  'law firm',
  'attorney',
  'dental',
  'medical',
  'clinic',
  'auto repair',
  'plumbing',
  'electric',
  'construction',
  'llc holdings',
  'investment',
] as const;

/** 常见大连锁 / 品牌词（启发式过滤；避免占满 leads） */
export const HOUSTON_CHAIN_NAME_HINTS = [
  'mcdonald',
  "mcdonald's",
  'burger king',
  'wendy',
  'subway',
  'starbucks',
  'dunkin',
  'taco bell',
  'chipotle',
  'panda express',
  'kfc',
  'popeyes',
  'chick-fil-a',
  'domino',
  'pizza hut',
  'little caesars',
  "applebee's",
  'ihop',
  'waffle house',
  'cracker barrel',
  'olive garden',
  'red lobster',
  'buffalo wild',
  'five guys',
  'shake shack',
  'in-n-out',
  'whataburger',
  'raising cane',
  'sonic drive',
  'jack in the box',
  '7-eleven',
  'circle k',
  'walmart',
  'target cafe',
  'costco',
  'whole foods',
  'trader joe',
  'h-e-b ',
  'heb ',
  'kroger',
] as const;

export type HoustonOpeningDisplayStatus =
  | 'pre-opening'
  | 'opening soon'
  | 'entity registered'
  | 'health_inspection_facility';

export interface HoustonOpeningIntel {
  /** 规格中的业务状态标签（不等同于 leads.lead_status CRM 字段） */
  display_status: HoustonOpeningDisplayStatus;
  /** 人类可读来源：DBA Filing / Food Permit / TX SOS / HDHHS */
  display_source: string;
  confidence_score?: 'HIGH' | 'MEDIUM' | 'LOW';
  permit_status?: 'pending' | 'approved' | string;
  /** 关键词命中（调试/展示） */
  keyword_hits?: string[];
  /** 是否被判定为大连锁（已过滤时可在 adapter 层丢弃） */
  likely_chain?: boolean;
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 名称或 DBA 是否命中餐饮关键词 */
export function matchesHoustonRestaurantKeyword(text: string): { ok: boolean; hits: string[] } {
  const n = norm(text);
  const hits: string[] = [];
  for (const kw of HOUSTON_RESTAURANT_KEYWORDS) {
    if (n.includes(kw)) hits.push(kw);
  }
  return { ok: hits.length > 0, hits };
}

export function matchesHoustonNonFoodExclusion(text: string): boolean {
  const n = norm(text);
  return HOUSTON_NON_FOOD_EXCLUSIONS.some((x) => n.includes(x));
}

export function isLikelyHoustonChainName(name: string): boolean {
  const n = norm(name);
  return HOUSTON_CHAIN_NAME_HINTS.some((h) => n.includes(h));
}

/** 去重/合并用地址键（休斯顿市内；不调用外部 geocoder） */
export function normalizeHoustonAddressKey(address: string | null, city: string): string {
  const raw = norm(`${address || ''} ${city || ''}`);
  return raw
    .replace(/[.,#]/g, ' ')
    .replace(/\bstreet\b/g, 'st')
    .replace(/\bst\.?\b/g, 'st')
    .replace(/\bavenue\b/g, 'ave')
    .replace(/\bave\.?\b/g, 'ave')
    .replace(/\bblvd\.?\b/g, 'blvd')
    .replace(/\bboulevard\b/g, 'blvd')
    .replace(/\bdrive\b/g, 'dr')
    .replace(/\bdr\.?\b/g, 'dr')
    .replace(/\broad\b/g, 'rd')
    .replace(/\brd\.?\b/g, 'rd')
    .replace(/\blane\b/g, 'ln')
    .replace(/\bunit\b/g, 'unit')
    .replace(/\bste\b/g, 'ste')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Sørensen–Dice 二元组相似度，0–1 */
export function diceCoefficientSimilarity(a: string, b: string): number {
  const bigrams = (s: string): string[] => {
    const t = norm(s).replace(/\s+/g, '');
    if (t.length < 2) return t.length ? [t] : [];
    const g: string[] = [];
    for (let i = 0; i < t.length - 1; i++) g.push(t.slice(i, i + 2));
    return g;
  };
  const A = bigrams(a);
  const B = bigrams(b);
  if (!A.length || !B.length) return 0;
  const map = new Map<string, number>();
  for (const x of A) map.set(x, (map.get(x) ?? 0) + 1);
  let inter = 0;
  for (const x of B) {
    const c = map.get(x) ?? 0;
    if (c > 0) {
      inter++;
      map.set(x, c - 1);
    }
  }
  return (2 * inter) / (A.length + B.length);
}

/** 跨源合并：名称相似度阈值（规格 ≥85%） */
export const HOUSTON_NAME_MERGE_MIN_SIMILARITY = 0.85;

/** 休斯顿数据源合并优先级（数值越大越优先保留为主记录） */
export const HOUSTON_SOURCE_MERGE_PRIORITY: Readonly<Record<string, number>> = {
  houston_health_food_permit: 120,
  houston_permit_portal: 110,
  houston_tabc: 100,
  houston_comptroller_sales_tax: 90,
  tx_sos_houston_supplement: 80,
  harris_county_dba: 70,
  houston_obo_certified: 60,
  houston_opendata_enrichment: 30,
  /** 历史 source id（仅合并旧记录） */
  houston_permit_ereport: 105,
  houston_hdhhs: 25,
};

export function houstonMergePriority(source: string): number {
  return HOUSTON_SOURCE_MERGE_PRIORITY[source] ?? 10;
}
