const WHITEPAGES_PERSON_URL = 'https://api.whitepages.com/v2/person';
export const WHITEPAGES_DEFAULT_PAGE_SIZE = 15;

/** Whitepages Pro Person Search 单条结果（保留 API 原始字段，不做裁剪） */
export type WhitepagesPersonRecord = Record<string, unknown>;

export interface WhitepagesSearchMetadata {
  result_count?: number;
  page?: number;
  page_size?: number;
  [key: string]: unknown;
}

export interface OwnerSearchInput {
  name?: string;
  region?: string;
  company?: string;
}

export interface OwnerSearchResult {
  total: number;
  results: WhitepagesPersonRecord[];
  metadata: WhitepagesSearchMetadata | null;
  /** 若用户填了公司名，API 不支持按公司检索，此处标记是否在服务端做了结果过滤 */
  company_filter_applied: boolean;
}

const US_STATE_CODES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
]);

const US_STATE_NAME_TO_CODE: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO',
  montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND',
  ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI',
  'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT',
  vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV',
  wisconsin: 'WI', wyoming: 'WY', 'district of columbia': 'DC',
};

/** 将用户输入的「地区」解析为 Whitepages city / state_code */
export function parseRegionInput(region: string): { city?: string; state_code?: string } {
  const trimmed = region.trim();
  if (!trimmed) return {};

  const cityState = /^(.+?),\s*([A-Za-z]{2})\s*$/.exec(trimmed);
  if (cityState) {
    return {
      city: cityState[1].trim(),
      state_code: cityState[2].toUpperCase(),
    };
  }

  const upper = trimmed.toUpperCase();
  if (trimmed.length === 2 && US_STATE_CODES.has(upper)) {
    return { state_code: upper };
  }

  const fromName = US_STATE_NAME_TO_CODE[trimmed.toLowerCase()];
  if (fromName) return { state_code: fromName };

  return { city: trimmed };
}

export function buildWhitepagesQueryParams(input: OwnerSearchInput): URLSearchParams | null {
  const name = input.name?.trim() ?? '';
  const region = input.region?.trim() ?? '';

  const hasName = name.length >= 2;
  const hasRegion = region.length >= 2;
  if (!hasName && !hasRegion) return null;

  const params = new URLSearchParams();
  if (hasName) params.set('name', name);

  const { city, state_code } = parseRegionInput(region);
  if (city) params.set('city', city);
  if (state_code) params.set('state_code', state_code);

  params.set('page_size', String(WHITEPAGES_DEFAULT_PAGE_SIZE));
  params.set('page', '1');
  params.set('include_fuzzy_matching', 'true');
  params.set('include_historical_locations', 'true');

  return params;
}

function companyMatches(record: WhitepagesPersonRecord, company: string): boolean {
  const needle = company.trim().toLowerCase();
  if (!needle) return true;
  const cn = record.company_name;
  if (typeof cn === 'string' && cn.toLowerCase().includes(needle)) return true;
  const jt = record.job_title;
  if (typeof jt === 'string' && jt.toLowerCase().includes(needle)) return true;
  return false;
}

export async function searchWhitepagesOwners(
  apiKey: string,
  input: OwnerSearchInput,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<OwnerSearchResult> {
  const params = buildWhitepagesQueryParams(input);
  if (!params) throw new Error('EMPTY_QUERY');

  const res = await fetchImpl(`${WHITEPAGES_PERSON_URL}?${params.toString()}`, {
    headers: {
      Accept: 'application/json',
      'X-Api-Key': apiKey,
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const errJson = (await res.json()) as { error?: { message?: string; long_message?: string }; message?: string };
      detail = errJson.error?.long_message ?? errJson.error?.message ?? errJson.message ?? detail;
    } catch {
      /* ignore */
    }
    throw new Error(`WP_${res.status}:${detail}`);
  }

  const json = (await res.json()) as {
    results?: WhitepagesPersonRecord[];
    metadata?: WhitepagesSearchMetadata;
  };

  let results = Array.isArray(json.results) ? json.results : [];
  const company = input.company?.trim() ?? '';
  let company_filter_applied = false;
  if (company.length >= 2) {
    company_filter_applied = true;
    results = results.filter((r) => companyMatches(r, company));
  }

  const meta = json.metadata ?? null;
  const total =
    company_filter_applied
      ? results.length
      : typeof meta?.result_count === 'number'
        ? meta.result_count
        : results.length;

  return {
    total,
    results,
    metadata: meta,
    company_filter_applied,
  };
}
