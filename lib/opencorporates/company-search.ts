/**
 * 企业登记检索：加州优先 CA SOS BE Public Search API，其他州回退 OpenCorporates。
 */

import {
  caSosApiConfigured,
  searchCaSosCompanies,
  type CaSosBeEntity,
} from '@/lib/ca-sos/be-public-search';

const OC_BASE = 'https://api.opencorporates.com/v0.4';

export type RegistryProvider = 'ca_sos' | 'opencorporates' | 'none';

export interface OcOfficerHit {
  name: string;
  position: string;
}

export interface OcCompanyHit {
  name: string;
  jurisdiction_code: string;
  company_number: string;
  registered_address: string | null;
  officers: OcOfficerHit[];
  opencorporates_url: string | null;
  /** 实际数据源（加州 SOS 或 OpenCorporates） */
  registry_provider?: RegistryProvider;
  registry_url?: string | null;
  /** 加州 SOS 原始实体（证据链明细用） */
  ca_sos_entity?: CaSosBeEntity;
}

export interface RegistrySearchResult {
  companies: OcCompanyHit[];
  provider: RegistryProvider;
}

interface OcApiOfficer {
  name: string;
  position: string;
}

interface OcApiSearchResult {
  company: {
    name: string;
    jurisdiction_code?: string;
    company_number?: string;
    opencorporates_url?: string;
    registered_address?: { street_address?: string; locality?: string; region?: string; postal_code?: string };
    officers?: { officer: OcApiOfficer }[];
  };
}

interface OcApiResponse {
  results?: { companies?: OcApiSearchResult[] };
}

const STATE_TO_JURISDICTION: Record<string, string> = {
  AL: 'us_al', AK: 'us_ak', AZ: 'us_az', AR: 'us_ar', CA: 'us_ca', CO: 'us_co', CT: 'us_ct',
  DE: 'us_de', FL: 'us_fl', GA: 'us_ga', HI: 'us_hi', ID: 'us_id', IL: 'us_il', IN: 'us_in',
  IA: 'us_ia', KS: 'us_ks', KY: 'us_ky', LA: 'us_la', ME: 'us_me', MD: 'us_md', MA: 'us_ma',
  MI: 'us_mi', MN: 'us_mn', MS: 'us_ms', MO: 'us_mo', MT: 'us_mt', NE: 'us_ne', NV: 'us_nv',
  NH: 'us_nh', NJ: 'us_nj', NM: 'us_nm', NY: 'us_ny', NC: 'us_nc', ND: 'us_nd', OH: 'us_oh',
  OK: 'us_ok', OR: 'us_or', PA: 'us_pa', RI: 'us_ri', SC: 'us_sc', SD: 'us_sd', TN: 'us_tn',
  TX: 'us_tx', UT: 'us_ut', VT: 'us_vt', VA: 'us_va', WA: 'us_wa', WV: 'us_wv', WI: 'us_wi',
  WY: 'us_wy', DC: 'us_dc',
};

export function jurisdictionFromStateCode(stateCode: string | undefined): string {
  if (!stateCode) return 'us';
  return STATE_TO_JURISDICTION[stateCode.toUpperCase()] ?? 'us';
}

function formatRegisteredAddress(
  addr: OcApiSearchResult['company']['registered_address'],
): string | null {
  if (!addr) return null;
  const parts = [
    addr.street_address,
    addr.locality,
    addr.region,
    addr.postal_code,
  ]
    .map((p) => (typeof p === 'string' ? p.trim() : ''))
    .filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}

/**
 * 按管辖区选政府/第三方登记 API：加州 + CA_SOS_BE_SUBSCRIPTION_KEY → SOS 一手数据。
 */
export async function searchRegistryCompanies(
  query: string,
  options: {
    jurisdictionCode?: string;
    entityNumber?: string;
    maxResults?: number;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<RegistrySearchResult> {
  const jurisdiction = options.jurisdictionCode ?? 'us';

  if (jurisdiction === 'us_ca' && caSosApiConfigured()) {
    const companies = await searchCaSosCompanies(query, {
      entityNumber: options.entityNumber,
      expectedEntityName: query,
      maxResults: options.maxResults,
      fetchImpl: options.fetchImpl,
    });
    if (companies.length > 0) {
      return { companies, provider: 'ca_sos' };
    }
  }

  const companies = await searchOpenCorporatesCompanies(query, options);
  return {
    companies: companies.map((c) => ({ ...c, registry_provider: 'opencorporates' as const })),
    provider: companies.length > 0 ? 'opencorporates' : 'none',
  };
}

export async function searchOpenCorporatesCompanies(
  query: string,
  options: {
    jurisdictionCode?: string;
    maxResults?: number;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<OcCompanyHit[]> {
  const q = query.trim().slice(0, 120);
  if (q.length < 2) return [];

  const apiKey = process.env.OPENCORPORATES_API_TOKEN?.trim();
  const jurisdiction = options.jurisdictionCode ?? 'us';
  const tokenParam = apiKey ? `&api_token=${encodeURIComponent(apiKey)}` : '';
  const url = `${OC_BASE}/companies/search?q=${encodeURIComponent(q)}&jurisdiction_code=${encodeURIComponent(jurisdiction)}&per_page=${Math.min(options.maxResults ?? 3, 5)}${tokenParam}`;

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return [];

    const json = (await res.json()) as OcApiResponse;
    const companies = json.results?.companies ?? [];

    return companies.slice(0, options.maxResults ?? 3).map((row) => {
      const c = row.company;
      const officers = (c.officers ?? []).map((o) => ({
        name: o.officer.name,
        position: o.officer.position,
      }));
      return {
        name: c.name,
        jurisdiction_code: c.jurisdiction_code ?? jurisdiction,
        company_number: c.company_number ?? '',
        registered_address: formatRegisteredAddress(c.registered_address),
        officers,
        opencorporates_url: c.opencorporates_url ?? null,
      };
    });
  } catch {
    return [];
  }
}

export function formatOcCompaniesForPrompt(companies: OcCompanyHit[]): string {
  if (companies.length === 0) {
    const ca = caSosApiConfigured();
    if (ca) {
      return '（CA SOS BE API 无匹配；请核对法人名或 ca_entity_number）';
    }
    return '（企业登记 API 无匹配；加州请配置 CA_SOS_BE_SUBSCRIPTION_KEY，其他州可配置 OPENCORPORATES_API_TOKEN）';
  }
  return companies
    .map((c, i) => {
      const providerLabel =
        c.registry_provider === 'ca_sos' ? 'CA SOS' : 'OpenCorporates';
      const officerLines = c.officers.length
        ? c.officers.map((o) => `  - ${o.name} (${o.position})`).join('\n')
        : '  - （无 agent/manager 列表）';
      const url = c.registry_url ?? c.opencorporates_url;
      return [
        `[REG-${i + 1}] ${c.name}（${providerLabel}）`,
        `  管辖区/编号: ${c.jurisdiction_code} / ${c.company_number || '—'}`,
        c.registered_address ? `  注册地址: ${c.registered_address}` : null,
        url ? `  URL: ${url}` : null,
        `  登记联系人:\n${officerLines}`,
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n');
}
