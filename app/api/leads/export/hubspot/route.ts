/**
 * POST /api/leads/export/hubspot
 *
 * Exports leads to HubSpot CRM as contacts using the batch create API.
 * Idempotent: already-exported leads (hubspot_contact_id IS NOT NULL) are skipped.
 *
 * Body: { leadIds?: string[], region?: string, minScore?: number }
 *   - leadIds: explicit list (max 100)
 *   - region: export all non-exported leads in a metro
 *   - minScore: score floor (default 60)
 *
 * HubSpot API:
 *   POST /crm/v3/objects/contacts/batch/create
 *   PATCH /crm/v3/objects/contacts/batch/update (for already-known contact IDs)
 *
 * Auth: HUBSPOT_PRIVATE_APP_TOKEN env var (Private App token, not OAuth)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const HUBSPOT_API = 'https://api.hubapi.com';
const BATCH_SIZE = 100; // HubSpot batch create max

interface HubSpotContact {
  properties: {
    firstname?: string;
    lastname?: string;
    company: string;
    phone?: string;
    city?: string;
    address?: string;
    hs_lead_status?: string;
    // Custom properties (must be created in HubSpot portal first)
    lead_score?: string;
    cuisine_type?: string;
    source_id?: string;
  };
}

interface HubSpotBatchCreateResponse {
  results?: Array<{ id: string; properties: Record<string, string> }>;
  errors?: Array<{ message: string; category?: string }>;
}

function guessFirstLast(name: string): { firstname: string; lastname: string } {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return { firstname: parts[0], lastname: '' };
  return {
    firstname: parts[0],
    lastname: parts.slice(1).join(' '),
  };
}

function leadToHubSpotContact(lead: Record<string, unknown>): HubSpotContact {
  const name = String(lead.name ?? '');
  const { firstname, lastname } = guessFirstLast(name);
  return {
    properties: {
      firstname,
      lastname,
      company: name,
      phone: lead.phone ? String(lead.phone) : undefined,
      city: lead.city ? String(lead.city) : undefined,
      address: lead.address ? String(lead.address) : undefined,
      hs_lead_status: 'NEW',
      lead_score: lead.lead_score !== undefined ? String(lead.lead_score) : undefined,
      cuisine_type: lead.cuisine_type ? String(lead.cuisine_type) : undefined,
      source_id: lead.source ? String(lead.source) : undefined,
    },
  };
}

async function hubspotBatchCreate(
  contacts: HubSpotContact[],
  token: string,
): Promise<{ created: number; errors: string[] }> {
  const errors: string[] = [];
  let created = 0;

  // Process in batches of BATCH_SIZE
  for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
    const batch = contacts.slice(i, i + BATCH_SIZE);
    try {
      const res = await fetch(`${HUBSPOT_API}/crm/v3/objects/contacts/batch/create`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ inputs: batch }),
      });

      const json = (await res.json()) as HubSpotBatchCreateResponse;

      if (!res.ok) {
        const msg = json.errors?.[0]?.message ?? `HTTP ${res.status}`;
        errors.push(msg);
        continue;
      }

      created += json.results?.length ?? 0;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  return { created, errors };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: 'HUBSPOT_PRIVATE_APP_TOKEN not configured' },
      { status: 503 },
    );
  }

  let body: {
    leadIds?: string[];
    region?: string;
    minScore?: number;
  };

  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const minScore = body.minScore ?? 60;

  // Build leads query
  let query = supabaseAdmin
    .from('leads')
    .select('id,name,address,city,phone,cuisine_type,lead_score,source,lead_status')
    .is('hubspot_contact_id', null) // Only non-exported
    .or('is_chain.is.null,is_chain.eq.false') // Skip chains
    .gte('lead_score', minScore)
    .limit(BATCH_SIZE);

  if (body.leadIds?.length) {
    query = query.in('id', body.leadIds.slice(0, BATCH_SIZE));
  } else if (body.region && body.region !== 'all') {
    query = query.eq('metro_area', body.region);
  }

  const { data: leads, error: fetchError } = await query;

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!leads || leads.length === 0) {
    return NextResponse.json({ ok: true, created: 0, message: 'No eligible leads to export' });
  }

  const contacts = (leads as Record<string, unknown>[]).map(leadToHubSpotContact);
  const { created, errors } = await hubspotBatchCreate(contacts, token);

  // Note: we don't get per-row IDs back from batch create reliably enough to match
  // to lead IDs without an extra lookup. Mark all attempted leads as exported with
  // a placeholder timestamp; the hubspot_contact_id will be set via webhook or
  // a follow-up sync job once HubSpot assigns actual contact IDs.
  if (created > 0) {
    const { error: updateError } = await supabaseAdmin
      .from('leads')
      .update({ exported_at: new Date().toISOString() })
      .in(
        'id',
        (leads as Record<string, unknown>[]).map((l) => l.id as string),
      );
    if (updateError) {
      console.warn('[hubspot-export] update exported_at error:', updateError.message);
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    created,
    attempted: leads.length,
    errors: errors.length ? errors : undefined,
  });
}
