import type { LeadEvidenceSource } from '@/types/lead-evidence';
import {
  searchOpenCorporatesCompanies,
  type OcCompanyHit,
} from '@/lib/opencorporates/company-search';
import { pickPrimaryOfficer } from '@/lib/opencorporates/officers';
import { searchOpenCorporatesOfficersViaWeb } from '@/lib/opencorporates/web-officers';
import {
  classifyEntityNameKind,
  shouldSearchOpenCorporatesForEntity,
} from '@/lib/identity/entity-kind';
import { entityNamesMatch } from '@/lib/identity/normalize';
import { resolveLegalEntitySearchQuery } from '@/lib/identity/entity-search-query';
import type { IdentityNameHit } from './types';

function jurisdictionForMetro(metro: string | null | undefined): string {
  const map: Record<string, string> = {
    sf_bay: 'us_ca',
    la: 'us_ca',
    houston: 'us_tx',
    nyc: 'us_ny',
    chicago: 'us_il',
    seattle: 'us_wa',
    boston: 'us_ma',
    austin: 'us_tx',
  };
  return map[metro ?? ''] ?? 'us';
}

export interface LeadIdentityInput {
  lead_id: string;
  name: string;
  metro_area?: string | null;
  ca_entity_number?: string | null;
  source?: string | null;
  source_raw?: Record<string, unknown> | null;
}

function strFromRaw(raw: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = raw[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

function hitsFromSourceRaw(
  lead: LeadIdentityInput,
): IdentityNameHit[] {
  const raw = lead.source_raw;
  if (!raw || typeof raw !== 'object') return [];

  const hits: IdentityNameHit[] = [];
  const licenseSource: LeadEvidenceSource =
    lead.source?.includes('tabc') || lead.source?.includes('abc')
      ? 'abc'
      : 'business_license';

  // DataSF Registered Business Locations: ownership_name = legal entity holder (not DBA)
  const ownership = strFromRaw(raw, ['ownership_name']);
  if (ownership) {
    const kind = classifyEntityNameKind(ownership);
    if (kind === 'person') {
      hits.push({
        source: licenseSource,
        entityName: lead.name,
        personName: ownership,
        confidenceRaw: 0.88,
        rawPayload: { from: 'ownership_name', entity_kind: 'person' },
      });
    } else {
      hits.push({
        source: licenseSource,
        entityName: ownership,
        personName: null,
        confidenceRaw: 0.9,
        rawPayload: {
          from: 'ownership_name',
          entity_kind: kind === 'company' ? 'company' : 'unknown',
        },
      });
    }
  }

  const person = strFromRaw(raw, [
    'owner_name',
    'licensee_name',
    'business_owner',
    'applicant_name',
  ]);
  const entity = ownership
    ? null
    : strFromRaw(raw, [
        'legal_name',
        'business_name',
        'entity_name',
        'company_name',
        'ownership_name',
      ]);

  if (person || entity) {
    hits.push({
      source: licenseSource,
      entityName: entity ?? lead.name,
      personName: person,
      confidenceRaw: 0.65,
      rawPayload: { from: 'source_raw' },
    });
  }

  if (lead.ca_entity_number?.trim()) {
    hits.push({
      source: 'ca_sos',
      entityName: entity ?? lead.name,
      personName: person,
      confidenceRaw: 0.75,
      rawPayload: { ca_entity_number: lead.ca_entity_number.trim() },
    });
  }

  return hits;
}

function pickBestOcCompany(
  companies: readonly OcCompanyHit[],
  expectedEntity: string | null,
): OcCompanyHit | null {
  if (companies.length === 0) return null;
  if (expectedEntity) {
    const matched = companies.find((c) => entityNamesMatch(c.name, expectedEntity));
    if (matched) return matched;
  }
  return companies[0] ?? null;
}

function metroRegionLabel(metro: string | null | undefined): string | undefined {
  const map: Record<string, string> = {
    sf_bay: 'San Francisco, CA',
    la: 'Los Angeles, CA',
    houston: 'Houston, TX',
    nyc: 'New York, NY',
    chicago: 'Chicago, IL',
    seattle: 'Seattle, WA',
    boston: 'Boston, MA',
    austin: 'Austin, TX',
  };
  return map[metro ?? ''];
}

export async function fetchOpenCorporatesHit(
  lead: LeadIdentityInput,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<IdentityNameHit | null> {
  const jurisdiction = jurisdictionForMetro(lead.metro_area);
  const query = resolveLegalEntitySearchQuery(lead);
  if (!shouldSearchOpenCorporatesForEntity(query)) return null;

  const expectedEntity =
    lead.source_raw && typeof lead.source_raw === 'object'
      ? strFromRaw(lead.source_raw, ['ownership_name'])
      : null;

  const address =
    lead.source_raw && typeof lead.source_raw === 'object'
      ? strFromRaw(lead.source_raw, [
          'address',
          'business_address',
          'location',
          'street_address',
        ])
      : null;

  const buildHit = (
    entityName: string,
    chosen: { name: string; position: string } | null,
    extras: Record<string, unknown>,
    baseConfidence: number,
  ): IdentityNameHit => {
    const entityMatchBoost =
      expectedEntity && entityNamesMatch(entityName, expectedEntity) ? 0.08 : 0;
    if (!chosen?.name) {
      return {
        source: 'opencorporates',
        entityName,
        personName: null,
        confidenceRaw: 0.55,
        rawPayload: {
          search_query: query,
          ...extras,
        },
      };
    }
    return {
      source: 'opencorporates',
      entityName,
      personName: chosen.name,
      confidenceRaw: Math.min(0.95, baseConfidence + entityMatchBoost),
      rawPayload: {
        position: chosen.position,
        search_query: query,
        ...extras,
      },
    };
  };

  try {
    const companies = await searchOpenCorporatesCompanies(query, {
      jurisdictionCode: jurisdiction,
      maxResults: 3,
      fetchImpl,
    });
    const company = pickBestOcCompany(companies, expectedEntity);
    let chosen = company ? pickPrimaryOfficer(company.officers) : null;
    let entityName = company?.name ?? query;
    let extras: Record<string, unknown> = company
      ? {
          opencorporates_url: company.opencorporates_url,
          officers: company.officers.slice(0, 6),
          lookup: 'api',
        }
      : { lookup: 'api', officers: [] };

    if (!chosen?.name) {
      const web = await searchOpenCorporatesOfficersViaWeb(entityName, {
        address: address ?? undefined,
        region: metroRegionLabel(lead.metro_area),
      });
      if (web.primary) {
        chosen = web.primary;
        extras = {
          ...extras,
          lookup: company ? 'api+web_search' : 'web_search',
          web_search_via: web.via,
          officers: web.officers.slice(0, 8),
        };
      }
    }

    if (!company && !chosen?.name) return null;

    return buildHit(entityName, chosen, extras, chosen ? 0.74 : 0.55);
  } catch {
    const web = await searchOpenCorporatesOfficersViaWeb(query, {
      address: address ?? undefined,
      region: metroRegionLabel(lead.metro_area),
    }).catch(() => null);
    if (!web?.primary) return null;
    return buildHit(
      query,
      web.primary,
      {
        lookup: 'web_search',
        web_search_via: web.via,
        officers: web.officers.slice(0, 8),
      },
      0.7,
    );
  }
}

export async function collectIdentityHits(
  lead: LeadIdentityInput,
  opts: { fetchImpl?: typeof fetch; skipOc?: boolean } = {},
): Promise<IdentityNameHit[]> {
  const hits: IdentityNameHit[] = [...hitsFromSourceRaw(lead)];

  if (!opts.skipOc) {
    const oc = await fetchOpenCorporatesHit(lead, opts.fetchImpl);
    if (oc) hits.push(oc);
  }

  return hits;
}
