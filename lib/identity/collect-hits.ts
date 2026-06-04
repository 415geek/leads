import type { LeadEvidenceSource } from '@/types/lead-evidence';
import type { IdentityNameHit } from './types';

const OC_BASE = 'https://api.opencorporates.com/v0.4';

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

interface OcOfficer {
  name: string;
  position: string;
}

interface OcApiResponse {
  results?: { companies?: Array<{ company: { name: string; officers?: Array<{ officer: OcOfficer }> } }> };
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
  const person = strFromRaw(raw, [
    'owner_name',
    'licensee_name',
    'business_owner',
    'applicant_name',
    'dba_name',
    'trade_name',
  ]);
  const entity = strFromRaw(raw, ['legal_name', 'business_name', 'entity_name', 'company_name']);

  if (person || entity) {
    const source: LeadEvidenceSource =
      lead.source?.includes('tabc') || lead.source?.includes('abc')
        ? 'abc'
        : 'business_license';
    hits.push({
      source,
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

export async function fetchOpenCorporatesHit(
  lead: LeadIdentityInput,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<IdentityNameHit | null> {
  const apiKey = process.env.OPENCORPORATES_API_TOKEN;
  const jurisdiction = jurisdictionForMetro(lead.metro_area);
  const q = encodeURIComponent(lead.name.slice(0, 80));
  const tokenParam = apiKey ? `&api_token=${apiKey}` : '';
  const url = `${OC_BASE}/companies/search?q=${q}&jurisdiction_code=${jurisdiction}${tokenParam}`;

  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const json = (await res.json()) as OcApiResponse;
    const company = json.results?.companies?.[0]?.company;
    if (!company) return null;

    const officers = company.officers?.map((o) => o.officer) ?? [];
    const prioritized = officers.filter((o) =>
      /owner|president|director|manager|principal/i.test(o.position),
    );
    const chosen = prioritized[0] ?? officers[0];
    if (!chosen?.name) {
      return {
        source: 'opencorporates',
        entityName: company.name,
        personName: null,
        confidenceRaw: 0.5,
        rawPayload: { company: company.name },
      };
    }

    return {
      source: 'opencorporates',
      entityName: company.name,
      personName: chosen.name,
      confidenceRaw: 0.72,
      rawPayload: { position: chosen.position },
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
