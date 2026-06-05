import type { LeadEvidenceSource } from '@/types/lead-evidence';
import {
  searchOpenCorporatesCompanies,
  type OcCompanyHit,
} from '@/lib/opencorporates/company-search';
import { pickPrimaryOfficer } from '@/lib/opencorporates/officers';
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
    hits.push({
      source: licenseSource,
      entityName: ownership,
      personName: null,
      confidenceRaw: 0.9,
      rawPayload: { from: 'ownership_name' },
    });
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

export async function fetchOpenCorporatesHit(
  lead: LeadIdentityInput,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<IdentityNameHit | null> {
  const jurisdiction = jurisdictionForMetro(lead.metro_area);
  const query = resolveLegalEntitySearchQuery(lead);
  const expectedEntity =
    lead.source_raw && typeof lead.source_raw === 'object'
      ? strFromRaw(lead.source_raw, ['ownership_name'])
      : null;

  try {
    const companies = await searchOpenCorporatesCompanies(query, {
      jurisdictionCode: jurisdiction,
      maxResults: 3,
      fetchImpl,
    });
    const company = pickBestOcCompany(companies, expectedEntity);
    if (!company) return null;

    const chosen = pickPrimaryOfficer(company.officers);
    if (!chosen?.name) {
      return {
        source: 'opencorporates',
        entityName: company.name,
        personName: null,
        confidenceRaw: 0.55,
        rawPayload: {
          company: company.name,
          search_query: query,
          opencorporates_url: company.opencorporates_url,
        },
      };
    }

    const entityMatchBoost =
      expectedEntity && entityNamesMatch(company.name, expectedEntity) ? 0.08 : 0;

    return {
      source: 'opencorporates',
      entityName: company.name,
      personName: chosen.name,
      confidenceRaw: Math.min(0.95, 0.78 + entityMatchBoost),
      rawPayload: {
        position: chosen.position,
        search_query: query,
        opencorporates_url: company.opencorporates_url,
        officers: company.officers.slice(0, 6),
      },
    };
  } catch {
    return null;
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
