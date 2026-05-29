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
  address?: string;
}

export interface ParsedAddressInput {
  street?: string;
  city?: string;
  state_code?: string;
  zipcode?: string;
}

export interface OwnerSearchResult {
  total: number;
  results: WhitepagesPersonRecord[];
  metadata: WhitepagesSearchMetadata | null;
}

export interface OwnerSearchContext {
  /** 是否满足 Whitepages 最低查询条件 */
  queryValid: boolean;
  hasName: boolean;
  hasAddress: boolean;
  hasRegion: boolean;
  /** 传给 LLM / Tavily 的检索姓名（无姓名时用关键字或占位说明） */
  nameForPrompt: string;
  /** 交叉验证关键字（显式关键字，或地址兜底） */
  keywordsForMatch: string;
  shouldRunKeywordAnalysis: boolean;
}

export function resolveOwnerSearchContext(input: OwnerSearchInput & { keywords?: string }): OwnerSearchContext {
  const name = input.name?.trim() ?? '';
  const region = input.region?.trim() ?? '';
  const address = input.address?.trim() ?? '';
  const keywords = input.keywords?.trim() ?? '';
  const addrParts = parseAddressInput(address);
  const hasName = name.length >= 2;
  const hasAddress = Boolean(addrParts.street && addrParts.street.length >= 3);
  const hasRegion = region.length >= 2;
  const queryValid = hasName || hasAddress || hasRegion;

  const keywordsForMatch =
    keywords.length >= 2 ? keywords : hasAddress ? address : '';
  const shouldRunKeywordAnalysis = keywordsForMatch.length >= 2;

  let nameForPrompt = name;
  if (!hasName) {
    if (keywords.length >= 2) {
      nameForPrompt = keywords;
    } else if (hasAddress) {
      nameForPrompt = '（未提供姓名，按地址检索）';
    } else {
      nameForPrompt = '（未提供姓名）';
    }
  }

  return {
    queryValid,
    hasName,
    hasAddress,
    hasRegion,
    nameForPrompt,
    keywordsForMatch,
    shouldRunKeywordAnalysis,
  };
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

/** 解析用户输入的街道地址，可与「地区」字段互补 */
export function parseAddressInput(address: string): ParsedAddressInput {
  const trimmed = address.trim();
  if (!trimmed) return {};

  const withZip =
    /^(.+?),\s*([^,]+?),\s*([A-Za-z]{2})\s+(\d{5})(?:-\d{4})?\s*$/.exec(trimmed);
  if (withZip) {
    return {
      street: withZip[1]!.trim(),
      city: withZip[2]!.trim(),
      state_code: withZip[3]!.toUpperCase(),
      zipcode: withZip[4]!,
    };
  }

  const cityState = /^(.+?),\s*([^,]+?),\s*([A-Za-z]{2})\s*$/.exec(trimmed);
  if (cityState) {
    return {
      street: cityState[1]!.trim(),
      city: cityState[2]!.trim(),
      state_code: cityState[3]!.toUpperCase(),
    };
  }

  return { street: trimmed };
}

export function buildWhitepagesQueryParams(input: OwnerSearchInput): URLSearchParams | null {
  const name = input.name?.trim() ?? '';
  const region = input.region?.trim() ?? '';
  const address = input.address?.trim() ?? '';

  const hasName = name.length >= 2;
  const hasRegion = region.length >= 2;
  const addrParts = parseAddressInput(address);
  const hasAddress = Boolean(addrParts.street && addrParts.street.length >= 3);
  if (!hasName && !hasRegion && !hasAddress) return null;

  const params = new URLSearchParams();
  if (hasName) params.set('name', name);

  const regionParts = parseRegionInput(region);
  let street = addrParts.street;
  let city = addrParts.city ?? regionParts.city;
  const state_code = addrParts.state_code ?? regionParts.state_code;

  if (street && regionParts.city && !addrParts.city) {
    const cityName = regionParts.city;
    const pattern = new RegExp(`\\b${cityName.replace(/\s+/g, '\\s+')}\\s*$`, 'i');
    if (pattern.test(street) && street.length > cityName.length + 4) {
      street = street.replace(pattern, '').trim().replace(/,\s*$/, '');
    }
  }

  if (street) params.set('street', street);
  if (addrParts.zipcode) params.set('zipcode', addrParts.zipcode);
  if (city) params.set('city', city);
  if (state_code) params.set('state_code', state_code);

  params.set('page_size', String(WHITEPAGES_DEFAULT_PAGE_SIZE));
  params.set('page', '1');
  params.set('include_fuzzy_matching', 'true');
  params.set('include_historical_locations', 'true');

  return params;
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

  const results = Array.isArray(json.results) ? json.results : [];
  const meta = json.metadata ?? null;
  const total =
    typeof meta?.result_count === 'number' ? meta.result_count : results.length;

  return {
    total,
    results,
    metadata: meta,
  };
}
