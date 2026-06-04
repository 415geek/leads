import type { SupabaseClient } from '@supabase/supabase-js';
import { isMissingSchemaError } from '@/lib/evidence/postgres-errors';
import { computeNewStoreSignal } from './new-store-signal';
import { getPropertyProvider } from './provider';
import { propertyLookupToEvidenceRows } from './to-evidence';
import type { PropertyLookupResult } from './types';

export function isLeadPropertyLookupEnabled(): boolean {
  return process.env.ENABLE_LEAD_PROPERTY_LOOKUP === '1';
}

export interface PropertyLookupLeadResult {
  leadId: string;
  apn: string | null;
  propertyOwnerName: string | null;
  permitsCount: number;
  newStoreSignal: { isNewStore: boolean; confidence: number; reason: string };
  evidenceInserted: number;
  schemaReady: boolean;
  schemaHint?: string;
}

interface LeadRow {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  apn?: string | null;
  source_raw?: Record<string, unknown> | null;
}

function liquorDatesFromSourceRaw(raw: Record<string, unknown> | null | undefined): string[] {
  if (!raw || typeof raw !== 'object') return [];
  const keys = [
    'license_issue_date',
    'issue_date',
    'original_issue_date',
    'permit_issue_date',
    'license_issued',
  ];
  const out: string[] = [];
  for (const k of keys) {
    const v = raw[k];
    if (typeof v === 'string' && v.trim()) out.push(v.trim().slice(0, 10));
  }
  return out;
}

export async function propertyLookupLeadById(
  supabase: SupabaseClient,
  leadId: string,
  opts: { fixture?: PropertyLookupResult } = {},
): Promise<PropertyLookupLeadResult> {
  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .select('id, name, address, city, apn, source_raw')
    .eq('id', leadId)
    .maybeSingle();

  if (leadErr) {
    if (isMissingSchemaError(leadErr)) {
      return emptyResult(leadId, 'Supabase 缺少 apn 等列，请先执行 lead_evidence 迁移。');
    }
    throw leadErr;
  }
  if (!lead) {
    const err = new Error('Lead not found');
    (err as Error & { statusCode?: number }).statusCode = 404;
    throw err;
  }

  const row = lead as LeadRow;
  const address = row.address?.trim() || row.name?.trim();
  if (!address) {
    const err = new Error('Lead has no address');
    (err as Error & { statusCode?: number }).statusCode = 400;
    throw err;
  }

  const provider = getPropertyProvider(opts.fixture);
  const lookup = await provider.lookup({
    address,
    apn: row.apn ?? undefined,
    city: row.city ?? undefined,
  });

  const signal = computeNewStoreSignal({
    permits: lookup.permits,
    liquorLicenseDates: liquorDatesFromSourceRaw(row.source_raw),
  });

  const evidenceRows = propertyLookupToEvidenceRows(
    leadId,
    lookup,
    signal,
    provider.id === 'mock' ? 'attom' : 'attom',
  );

  const { error: insertErr } = await supabase.from('lead_evidence').insert(evidenceRows);

  if (insertErr) {
    if (isMissingSchemaError(insertErr)) {
      return {
        leadId,
        apn: lookup.apn,
        propertyOwnerName: lookup.propertyOwnerName,
        permitsCount: lookup.permits.length,
        newStoreSignal: signal,
        evidenceInserted: 0,
        schemaReady: false,
        schemaHint: 'lead_evidence 表不存在，请在 Supabase SQL Editor 执行 20260602000000_lead_evidence.sql',
      };
    }
    throw insertErr;
  }

  return {
    leadId,
    apn: lookup.apn,
    propertyOwnerName: lookup.propertyOwnerName,
    permitsCount: lookup.permits.length,
    newStoreSignal: signal,
    evidenceInserted: evidenceRows.length,
    schemaReady: true,
  };
}

function emptyResult(leadId: string, hint: string): PropertyLookupLeadResult {
  return {
    leadId,
    apn: null,
    propertyOwnerName: null,
    permitsCount: 0,
    newStoreSignal: { isNewStore: false, confidence: 0, reason: 'skipped' },
    evidenceInserted: 0,
    schemaReady: false,
    schemaHint: hint,
  };
}
