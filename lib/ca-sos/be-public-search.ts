/**
 * California Secretary of State — BE Public Search API (v1.0.4)
 * @see California SOS BE Public Search API Guide
 * Auth header: Ocp-Apim-Subscription-Key
 */

import { entityNamesMatch } from '@/lib/identity/normalize';
import type { OcCompanyHit, OcOfficerHit } from '@/lib/opencorporates/company-search';
import { pickPrimaryOfficer } from '@/lib/opencorporates/officers';

const PROD_BASE = 'https://calico.sos.ca.gov/cbc/v1/api';
const UAT_BASE = 'https://calico.sos.ca.gov/cbc/uat/v1/api';

export interface CaSosBeEntity {
  EntityID: string;
  EntityName: string;
  EntityType: string;
  FilingDate?: string;
  StatusDescription?: string;
  ManagementDescription?: string | null;
  AgentName?: string;
  AgentAddress1?: string;
  AgentAddress2?: string;
  AgentCity?: string;
  AgentState?: string;
  AgentZipCode?: string;
  MailingStreetAddress1?: string | null;
  MailingStreetAddress2?: string | null;
  MailingCity?: string | null;
  MailingState?: string | null;
  MailingZipCode?: string | null;
  EntityStreetAddress1?: string | null;
  EntityCity?: string | null;
  EntityState?: string | null;
  EntityZipCode?: string | null;
  Jurisdiction?: string;
}

interface CaSosKeywordResponse {
  RecordCount?: number;
  EntityData?: CaSosBeEntity[];
}

const CORPORATE_AGENT_MARKERS =
  /\b(INC|LLC|CORP|LTD|REGISTERED AGENT|CT CORPORATION|CSC|LEGALZOOM|NATIONAL REGISTERED|COMPLIANCE|INCORP SERVICES)\b/i;

export function caSosApiConfigured(): boolean {
  return Boolean(process.env.CA_SOS_BE_SUBSCRIPTION_KEY?.trim());
}

export function caSosApiBase(): string {
  if (process.env.CA_SOS_BE_UAT === '1') return UAT_BASE;
  return process.env.CA_SOS_BE_API_BASE?.trim() || PROD_BASE;
}

function subscriptionKey(): string | null {
  return process.env.CA_SOS_BE_SUBSCRIPTION_KEY?.trim() ?? null;
}

function formatAddress(parts: Array<string | null | undefined>): string | null {
  const line = parts.map((p) => (typeof p === 'string' ? p.trim() : '')).filter(Boolean);
  return line.length > 0 ? line.join(', ') : null;
}

export function bizfileEntityUrl(entityId: string): string {
  const id = entityId.trim();
  return `https://bizfileonline.sos.ca.gov/search/business?SearchType=ENTITY&SearchCriteria=${encodeURIComponent(id)}`;
}

function isCorporateAgentName(name: string): boolean {
  const t = name.trim();
  if (t.length < 3) return true;
  return CORPORATE_AGENT_MARKERS.test(t);
}

function officersFromEntity(entity: CaSosBeEntity): OcOfficerHit[] {
  const officers: OcOfficerHit[] = [];

  const agent = entity.AgentName?.trim();
  if (agent && !isCorporateAgentName(agent)) {
    officers.push({ name: agent, position: 'registered agent' });
  }

  const mgmt = entity.ManagementDescription?.trim();
  if (mgmt) {
    const managerMatch = mgmt.match(
      /([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+)+)\s*(?:—|–|-|:)\s*(manager|member|ceo|president|chief)/i,
    );
    if (managerMatch) {
      officers.push({
        name: managerMatch[1]!.trim(),
        position: managerMatch[2]!.trim().toLowerCase(),
      });
    } else if (!isCorporateAgentName(mgmt) && /^[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+)+$/.test(mgmt)) {
      officers.push({ name: mgmt, position: 'manager' });
    }
  }

  const seen = new Set<string>();
  return officers.filter((o) => {
    const key = o.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function caSosEntityToCompanyHit(entity: CaSosBeEntity): OcCompanyHit {
  const mailing = formatAddress([
    entity.MailingStreetAddress1,
    entity.MailingCity,
    entity.MailingState,
    entity.MailingZipCode,
  ]);
  const street = formatAddress([
    entity.EntityStreetAddress1,
    entity.EntityCity,
    entity.EntityState,
    entity.EntityZipCode,
  ]);
  const agentAddr = formatAddress([
    entity.AgentAddress1,
    entity.AgentCity,
    entity.AgentState,
    entity.AgentZipCode,
  ]);

  const url = bizfileEntityUrl(entity.EntityID);

  return {
    name: entity.EntityName?.trim() || entity.EntityID,
    jurisdiction_code: 'us_ca',
    company_number: entity.EntityID?.trim() || '',
    registered_address: street ?? mailing ?? agentAddr,
    officers: officersFromEntity(entity),
    opencorporates_url: url,
    registry_provider: 'ca_sos',
    registry_url: url,
  };
}

async function caSosFetch(
  path: string,
  fetchImpl: typeof fetch,
): Promise<Response | null> {
  const key = subscriptionKey();
  if (!key) return null;

  try {
    return await fetchImpl(`${caSosApiBase()}${path}`, {
      headers: { 'Ocp-Apim-Subscription-Key': key },
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    return null;
  }
}

export async function fetchCaSosEntityByNumber(
  entityNumber: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<CaSosBeEntity | null> {
  const id = entityNumber.trim();
  if (!id) return null;

  const res = await caSosFetch(
    `/BusinessEntityDetails?entity-number=${encodeURIComponent(id)}`,
    fetchImpl,
  );
  if (!res?.ok) return null;

  const json = (await res.json()) as CaSosBeEntity;
  if (!json?.EntityID && !json?.EntityName) return null;
  return json;
}

export async function searchCaSosByKeyword(
  searchTerm: string,
  options: {
    maxResults?: number;
    beginsWith?: boolean;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<CaSosBeEntity[]> {
  const term = searchTerm.trim().slice(0, 120);
  if (term.length < 2) return [];

  const params = new URLSearchParams({
    'search-term': term,
    'begins-with': options.beginsWith ? 'true' : 'false',
  });

  const res = await caSosFetch(
    `/BusinessEntityKeywordSearch?${params.toString()}`,
    options.fetchImpl ?? globalThis.fetch,
  );
  if (!res?.ok) return [];

  const json = (await res.json()) as CaSosBeEntity | CaSosKeywordResponse;
  if ('EntityID' in json && json.EntityName) {
    return [json];
  }

  const rows = (json as CaSosKeywordResponse).EntityData ?? [];
  return rows.slice(0, options.maxResults ?? 5);
}

export function pickBestCaSosEntity(
  entities: readonly CaSosBeEntity[],
  expectedName: string | null,
): CaSosBeEntity | null {
  if (entities.length === 0) return null;
  if (expectedName) {
    const matched = entities.find((e) =>
      entityNamesMatch(e.EntityName ?? '', expectedName),
    );
    if (matched) return matched;
  }
  return entities[0] ?? null;
}

/** CA SOS keyword / entity-number → unified company hit list */
export async function searchCaSosCompanies(
  query: string,
  options: {
    entityNumber?: string;
    expectedEntityName?: string;
    maxResults?: number;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<OcCompanyHit[]> {
  if (!caSosApiConfigured()) return [];

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const expected = options.expectedEntityName?.trim() || query.trim();

  if (options.entityNumber?.trim()) {
    const byId = await fetchCaSosEntityByNumber(options.entityNumber, fetchImpl);
    if (byId) return [caSosEntityToCompanyHit(byId)];
  }

  const entities = await searchCaSosByKeyword(query, {
    maxResults: options.maxResults ?? 5,
    fetchImpl,
  });
  const best = pickBestCaSosEntity(entities, expected);
  if (!best) return [];

  return [caSosEntityToCompanyHit(best)];
}

export function primaryOfficerFromCaSosEntity(entity: CaSosBeEntity): OcOfficerHit | null {
  return pickPrimaryOfficer(officersFromEntity(entity));
}
