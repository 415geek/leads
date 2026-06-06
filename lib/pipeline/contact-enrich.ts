/**
 * Contact Enrichment — owner data from registry APIs + email pattern inference
 *
 * Two enrichment sources:
 *   1. CA SOS BE API (加州) / OpenCorporates（其他州）— agent/officer 姓名
 *   2. Email inference from Google Places `website` domain (never from name alone)
 *      Templates: info@, contact@, {first}@, {first}.{last}@
 *      All inferred: email_inferred=true, confidence<=0.4
 *
 * LAUNCH BLOCKER: OpenCorporates free tier is 50 req/day total across all metros.
 *   Cap enforced here: MAX_OC_CALLS_PER_RUN (default 30 for CA leads on free tier).
 *
 * Non-blocking: any failure leaves lead.contacts=[]; lead still upserts.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { searchRegistryCompanies } from '@/lib/opencorporates/company-search';
import { pickPrimaryOfficer } from '@/lib/opencorporates/officers';

export interface LeadContact {
  lead_id: string;
  name: string;
  role: string;
  phone: string | null;
  email: string | null;
  email_inferred: boolean;
  source: 'opencorporates' | 'ca_sos' | 'tx_sos' | 'google' | 'inferred';
  confidence: number | null;
}

export interface EnrichedLeadInput {
  lead_id: string;
  name: string;
  address: string | null;
  city: string | null;
  metro_area: string;
  source: string;
  website?: string | null;
}

// ─── Rate limiting ────────────────────────────────────────────────────────────

const MAX_OC_CALLS_PER_RUN =
  parseInt(process.env.OPENCORPORATES_DAILY_CAP ?? '30', 10);

let ocCallsThisRun = 0;

export function _resetOcCallCountForTests(): void {
  ocCallsThisRun = 0;
}

export function getOcCallCount(): number {
  return ocCallsThisRun;
}

// ─── Registry (CA SOS / OpenCorporates) ───────────────────────────────────────

function jurisdictionForMetro(metro: string): string {
  const map: Record<string, string> = {
    sf_bay: 'us_ca',
    la: 'us_ca',
    houston: 'us_tx',
    nyc: 'us_ny',
    chicago: 'us_il',
    seattle: 'us_wa',
    boston: 'us_ma',
    dallas: 'us_tx',
    austin: 'us_tx',
    miami: 'us_fl',
    las_vegas: 'us_nv',
    denver: 'us_co',
    phoenix: 'us_az',
    atlanta: 'us_ga',
  };
  return map[metro] ?? 'us';
}

async function fetchRegistryOfficer(
  businessName: string,
  metro: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<{ name: string; position: string; source: 'ca_sos' | 'opencorporates' } | null> {
  if (ocCallsThisRun >= MAX_OC_CALLS_PER_RUN) {
    return null;
  }

  const jurisdiction = jurisdictionForMetro(metro);

  try {
    ocCallsThisRun += 1;
    const { companies, provider } = await searchRegistryCompanies(businessName.slice(0, 80), {
      jurisdictionCode: jurisdiction,
      maxResults: 1,
      fetchImpl,
    });
    if (companies.length === 0) return null;

    const chosen = pickPrimaryOfficer(companies[0]!.officers);
    if (!chosen?.name) return null;

    return {
      name: chosen.name,
      position: chosen.position,
      source: provider === 'ca_sos' ? 'ca_sos' : 'opencorporates',
    };
  } catch (err) {
    console.warn('[contact-enrich] registry fetch error:', businessName, err);
    return null;
  }
}

// ─── Email inference ──────────────────────────────────────────────────────────

function domainFromWebsite(website: string | null | undefined): string | null {
  if (!website) return null;
  try {
    const u = new URL(
      website.startsWith('http') ? website : `https://${website}`,
    );
    const host = u.hostname.replace(/^www\./, '');
    if (!host || host.length < 4) return null;
    return host;
  } catch {
    return null;
  }
}

function firstLastFromName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean);
  return {
    first: parts[0] ?? '',
    last: parts[parts.length - 1] ?? '',
  };
}

function inferEmails(
  ownerName: string | null,
  domain: string,
): Array<{ email: string; confidence: number }> {
  const results: Array<{ email: string; confidence: number }> = [
    { email: `info@${domain}`, confidence: 0.3 },
    { email: `contact@${domain}`, confidence: 0.25 },
  ];

  if (ownerName) {
    const { first, last } = firstLastFromName(ownerName);
    if (first) {
      results.push({ email: `${first}@${domain}`, confidence: 0.4 });
      if (last && last !== first) {
        results.push({ email: `${first}.${last}@${domain}`, confidence: 0.35 });
      }
    }
  }

  return results;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function enrichLeadContacts(
  lead: EnrichedLeadInput,
  opts: {
    fetchImpl?: typeof fetch;
    skipOc?: boolean;
  } = {},
): Promise<LeadContact[]> {
  const contacts: LeadContact[] = [];
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;

  // 1. Registry officer/agent lookup (CA SOS or OpenCorporates)
  let primaryOwnerName: string | null = null;

  if (!opts.skipOc) {
    try {
      const chosen = await fetchRegistryOfficer(lead.name, lead.metro_area, fetchImpl);
      if (chosen) {
        primaryOwnerName = chosen.name;
        contacts.push({
          lead_id: lead.lead_id,
          name: chosen.name,
          role: chosen.position || 'officer',
          phone: null,
          email: null,
          email_inferred: false,
          source: chosen.source,
          confidence: chosen.source === 'ca_sos' ? 0.78 : 0.7,
        });
      }
    } catch (err) {
      console.warn('[contact-enrich] registry lookup failed:', lead.name, err);
    }
  }

  // 2. Email inference from Google Places website domain
  const domain = domainFromWebsite(lead.website);
  if (domain) {
    const inferred = inferEmails(primaryOwnerName, domain);
    for (const { email, confidence } of inferred) {
      contacts.push({
        lead_id: lead.lead_id,
        name: primaryOwnerName ?? lead.name,
        role: 'owner',
        phone: null,
        email,
        email_inferred: true,
        source: 'inferred',
        confidence,
      });
    }
  }

  return contacts;
}

/**
 * Batch enrichment — processes an array of leads and writes contacts to Supabase.
 * Non-blocking per-lead: failures skip that lead's contacts silently.
 */
export async function enrichAndWriteContacts(
  supa: SupabaseClient,
  leads: EnrichedLeadInput[],
  opts: {
    fetchImpl?: typeof fetch;
    skipOc?: boolean;
  } = {},
): Promise<{ total: number; skipped: number }> {
  let total = 0;
  let skipped = 0;

  for (const lead of leads) {
    try {
      const contacts = await enrichLeadContacts(lead, opts);
      if (contacts.length === 0) continue;

      const { error } = await supa.from('lead_contacts').upsert(contacts, {
        onConflict: 'lead_id,source,email',
        ignoreDuplicates: true,
      });

      if (error) {
        console.warn('[contact-enrich] write error for lead', lead.lead_id, error.message);
        skipped += 1;
      } else {
        total += contacts.length;
      }
    } catch (err) {
      console.warn('[contact-enrich] enrichment error for lead', lead.name, err);
      skipped += 1;
    }
  }

  return { total, skipped };
}
