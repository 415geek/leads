import type { SupabaseClient } from '@supabase/supabase-js';
import { isMissingSchemaError } from '@/lib/evidence/postgres-errors';
import { getSkipTraceProvider } from './provider';
import { skipTraceToEvidenceRows } from './skip-trace-to-evidence';
import type { SkipTraceResult } from './types';
import { SkipTraceError } from './types';

export function isLeadSkipTraceEnrichEnabled(): boolean {
  return process.env.ENABLE_LEAD_SKIP_TRACE_ENRICH === '1';
}

export interface SkipTraceEnrichLeadResult {
  leadId: string;
  phonesFound: number;
  emailsFound: number;
  evidenceInserted: number;
  schemaReady: boolean;
  schemaHint?: string;
}

interface LeadRow {
  id: string;
  name: string;
  address: string | null;
  owner_person_name?: string | null;
  apn?: string | null;
}

export async function skipTraceEnrichLeadById(
  supabase: SupabaseClient,
  leadId: string,
  opts: { fixture?: SkipTraceResult } = {},
): Promise<SkipTraceEnrichLeadResult> {
  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .select('id, name, address, owner_person_name, apn')
    .eq('id', leadId)
    .maybeSingle();

  if (leadErr) {
    if (isMissingSchemaError(leadErr)) {
      return emptyResult(leadId, 'Supabase 缺少 owner_person_name / apn 列，请先执行 lead_evidence 迁移。');
    }
    throw leadErr;
  }
  if (!lead) {
    const err = new Error('Lead not found');
    (err as Error & { statusCode?: number }).statusCode = 404;
    throw err;
  }

  const row = lead as LeadRow;
  const address = row.address?.trim();
  if (!address) {
    const err = new Error('Lead has no address for skip-trace');
    (err as Error & { statusCode?: number }).statusCode = 400;
    throw err;
  }

  const personName = row.owner_person_name?.trim() || row.name?.trim();
  if (!personName) {
    const err = new Error('Lead has no owner person name; run identify first');
    (err as Error & { statusCode?: number }).statusCode = 400;
    throw err;
  }

  const provider = getSkipTraceProvider(opts.fixture);
  let trace: SkipTraceResult;
  try {
    trace = await provider.skipTrace({
      personName,
      address,
      apn: row.apn ?? undefined,
    });
  } catch (err) {
    if (err instanceof SkipTraceError) throw err;
    throw new SkipTraceError('Skip-trace failed', 'upstream', err);
  }

  const source = provider.id === 'mock' ? 'batchdata' : 'batchdata';
  const evidenceRows = skipTraceToEvidenceRows(leadId, trace, source);

  if (evidenceRows.length === 0) {
    return {
      leadId,
      phonesFound: 0,
      emailsFound: 0,
      evidenceInserted: 0,
      schemaReady: true,
    };
  }

  const { error: insertErr } = await supabase.from('lead_evidence').insert(evidenceRows);
  if (insertErr) {
    if (isMissingSchemaError(insertErr)) {
      return {
        leadId,
        phonesFound: trace.phones.length,
        emailsFound: trace.emails.length,
        evidenceInserted: 0,
        schemaReady: false,
        schemaHint: 'lead_evidence 表不存在，请在 Supabase SQL Editor 执行 20260602000000_lead_evidence.sql',
      };
    }
    throw insertErr;
  }

  return {
    leadId,
    phonesFound: trace.phones.length,
    emailsFound: trace.emails.length,
    evidenceInserted: evidenceRows.length,
    schemaReady: true,
  };
}

function emptyResult(leadId: string, hint: string): SkipTraceEnrichLeadResult {
  return {
    leadId,
    phonesFound: 0,
    emailsFound: 0,
    evidenceInserted: 0,
    schemaReady: false,
    schemaHint: hint,
  };
}
