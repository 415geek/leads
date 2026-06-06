/**
 * 老板关键字交叉验证：政府企业登记 + OpenCorporates 定向网页证据
 */

import { tavilySearchInDomains } from '@/lib/intel/deep-person-intel';
import {
  formatOcCompaniesForPrompt,
  jurisdictionFromStateCode,
  searchRegistryCompanies,
  type OcCompanyHit,
  type RegistryProvider,
} from '@/lib/opencorporates/company-search';
import { parseAddressInput, parseRegionInput } from '@/lib/whitepages/owner-search';

/** 政府企业登记 / OpenCorporates 定向搜索域 */
export const GOVERNMENT_REGISTRY_DOMAINS = [
  'opencorporates.com',
  'bizfileonline.sos.ca.gov',
  'sos.ca.gov',
  'sos.state.tx.us',
  'comptroller.texas.gov',
  'dos.ny.gov',
  'ilsos.gov',
  'sunbiz.org',
  'corp.delaware.gov',
  'wa.gov',
  'sos.wa.gov',
  'sos.state.co.us',
] as const;

export interface RegistryWebSnippet {
  title: string;
  url: string;
  content: string;
}

export interface OwnerRegistryEvidence {
  opencorporates_companies: OcCompanyHit[];
  opencorporates_prompt: string;
  registry_web_snippets: RegistryWebSnippet[];
  jurisdiction_code: string;
  registry_provider: RegistryProvider;
}

function quotedIfHasSpace(v: string): string {
  return /\s/.test(v) ? `"${v}"` : v;
}

function resolveStateCode(region?: string, address?: string): string | undefined {
  const fromRegion = parseRegionInput(region ?? '').state_code;
  if (fromRegion) return fromRegion;
  return parseAddressInput(address ?? '').state_code;
}

export function buildRegistryWebQueries(input: {
  name: string;
  keywords: string;
  /** DataSF ownership_name 等法人实体；优先用于 OpenCorporates 定向查询 */
  entityName?: string;
  region?: string;
  address?: string;
}): string[] {
  const name = quotedIfHasSpace(input.name.trim());
  const keywords = quotedIfHasSpace(input.keywords.trim());
  const entity = input.entityName?.trim() ? quotedIfHasSpace(input.entityName.trim()) : '';
  const region = input.region?.trim() ? quotedIfHasSpace(input.region.trim()) : '';
  const address = input.address?.trim() ? quotedIfHasSpace(input.address.trim()) : '';

  const queries: string[] = [];
  if (entity) {
    queries.push(
      `${entity} opencorporates CEO director agent CFO officers`,
      `${entity} opencorporates.com registered agent`,
    );
  }
  queries.push(
    [keywords, name, 'officer director LLC'].filter(Boolean).join(' '),
    [keywords, 'opencorporates company registration'].filter(Boolean).join(' '),
    [keywords, address, region, 'secretary of state business'].filter(Boolean).join(' '),
    [name, keywords, address, 'registered agent'].filter(Boolean).join(' '),
  );

  const seen = new Set<string>();
  return queries
    .map((q) => q.replace(/\s+/g, ' ').trim())
    .filter((q) => {
      if (!q || seen.has(q)) return false;
      seen.add(q);
      return true;
    });
}

export async function collectOwnerRegistryEvidence(input: {
  name: string;
  keywords: string;
  /** DataSF ownership_name 等；优先于 keywords 查企业登记 API */
  entityName?: string;
  /** CA SOS entity number（有则直达 BusinessEntityDetails） */
  caEntityNumber?: string;
  region?: string;
  address?: string;
  fetchImpl?: typeof fetch;
  searchOverride?: (queries: string[]) => Promise<RegistryWebSnippet[]>;
}): Promise<OwnerRegistryEvidence> {
  const jurisdiction_code = jurisdictionFromStateCode(
    resolveStateCode(input.region, input.address),
  );

  const ocQuery = input.entityName?.trim() || input.keywords.trim();

  const [registryResult, registry_web_snippets] = await Promise.all([
    searchRegistryCompanies(ocQuery, {
      jurisdictionCode: jurisdiction_code,
      entityNumber: input.caEntityNumber?.trim(),
      maxResults: 3,
      fetchImpl: input.fetchImpl,
    }),
    (async () => {
      if (input.searchOverride) {
        return input.searchOverride(buildRegistryWebQueries(input));
      }
      const queries = buildRegistryWebQueries(input);
      const seen = new Set<string>();
      const merged: RegistryWebSnippet[] = [];
      const batches = await Promise.all(
        queries.map((q) =>
          tavilySearchInDomains(q, GOVERNMENT_REGISTRY_DOMAINS, 4).catch(() => []),
        ),
      );
      for (const batch of batches) {
        for (const row of batch) {
          if (!row.url || seen.has(row.url)) continue;
          seen.add(row.url);
          merged.push(row);
          if (merged.length >= 12) return merged;
        }
      }
      return merged;
    })(),
  ]);

  const opencorporates_companies = registryResult.companies;

  return {
    opencorporates_companies,
    opencorporates_prompt: formatOcCompaniesForPrompt(opencorporates_companies),
    registry_web_snippets,
    jurisdiction_code,
    registry_provider: registryResult.provider,
  };
}

export function registrySnippetsBlock(snippets: RegistryWebSnippet[]): string {
  if (snippets.length === 0) {
    return '（政府登记/OpenCorporates 定向网页搜索无结果或未配置 TAVILY_API_KEY）';
  }
  return snippets
    .map(
      (s, i) =>
        `[REG-${i + 1}] ${s.title}\nURL: ${s.url}\n${s.content}`,
    )
    .join('\n\n');
}
