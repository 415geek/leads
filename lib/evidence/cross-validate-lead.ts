import type { SupabaseClient } from '@supabase/supabase-js';
import type { LeadEvidence } from '@/types/lead-evidence';
import { isMissingSchemaError } from './postgres-errors';
import {
  scoreContactChannels,
  scoreNewStoreFromEvidence,
  type ScoredContactChannel,
} from '@/lib/scoring/score-contact';
import type { EvidenceRowForScoring } from '@/lib/scoring/score-contact';

export interface CrossValidateLeadResult {
  leadId: string;
  contacts: ScoredContactChannel[];
  storeStatus: string;
  newStoreConfidence: number | null;
  contactsUpserted: number;
  /** When lead_evidence table or columns are missing in Supabase. */
  schemaReady: boolean;
  schemaHint?: string;
}

interface LeadRow {
  id: string;
  name: string;
  owner_person_name?: string | null;
}

export function isLeadEvidenceCrossValidateEnabled(): boolean {
  return process.env.ENABLE_LEAD_EVIDENCE_CROSS_VALIDATE === '1';
}

export async function crossValidateLeadById(
  supabase: SupabaseClient,
  leadId: string,
): Promise<CrossValidateLeadResult> {
  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .select('id, name, owner_person_name')
    .eq('id', leadId)
    .maybeSingle();

  if (leadErr) {
    if (isMissingSchemaError(leadErr)) {
      return emptyResult(leadId, 'Supabase 缺少 owner_person_name 等列，请先执行 lead_evidence 迁移。');
    }
    throw leadErr;
  }
  if (!lead) {
    const err = new Error('Lead not found');
    (err as Error & { statusCode?: number }).statusCode = 404;
    throw err;
  }

  const { data: evidence, error: evErr } = await supabase
    .from('lead_evidence')
    .select('field, value, source, confidence_raw, raw_payload')
    .eq('lead_id', leadId);

  if (evErr) {
    if (isMissingSchemaError(evErr)) {
      return emptyResult(leadId, 'lead_evidence 表不存在，请在 Supabase SQL Editor 执行 20260602000000_lead_evidence.sql');
    }
    throw evErr;
  }

  const rows = (evidence ?? []) as EvidenceRowForScoring[];
  const ownerLocked = Boolean((lead as LeadRow).owner_person_name?.trim());
  const contacts = scoreContactChannels(rows, { ownerPersonLocked: ownerLocked });
  const store = scoreNewStoreFromEvidence(rows);

  let contactsUpserted = 0;
  const leadRow = lead as LeadRow;
  const displayName = leadRow.owner_person_name?.trim() || leadRow.name?.trim() || 'Owner';

  const usable = contacts.filter((c) => c.status !== 'discarded');

  for (const ch of usable) {
    const phone = ch.type === 'phone' ? ch.value : null;
    const email = ch.type === 'email' ? ch.value : null;
    const confidence01 = ch.confidence / 100;

    let query = supabase.from('lead_contacts').select('id').eq('lead_id', leadId).limit(20);
    if (phone) query = query.eq('phone', phone);
    if (email) query = query.eq('email', email);

    const { data: existing } = await query;
    const row = {
      name: displayName,
      role: 'owner',
      phone,
      email,
      email_inferred: false,
      source: 'evidence_scoring' as const,
      confidence: confidence01,
    };

    if (existing && existing.length > 0) {
      const { error: updErr } = await supabase
        .from('lead_contacts')
        .update({ confidence: confidence01 })
        .eq('id', existing[0].id);
      if (!updErr) contactsUpserted += 1;
      continue;
    }

    const { error: insertErr } = await supabase.from('lead_contacts').insert({
      lead_id: leadId,
      ...row,
    });

    if (insertErr && isMissingSchemaError(insertErr)) {
      const fallback = await supabase.from('lead_contacts').insert({
        lead_id: leadId,
        ...row,
        source: 'inferred',
      });
      if (!fallback.error) contactsUpserted += 1;
    } else if (!insertErr) {
      contactsUpserted += 1;
    }
  }

  const leadPatch: Record<string, unknown> = {
    store_status: store.storeStatus,
    new_store_confidence: store.confidence,
  };

  const { error: patchErr } = await supabase.from('leads').update(leadPatch).eq('id', leadId);
  if (patchErr && isMissingSchemaError(patchErr)) {
    return {
      leadId,
      contacts,
      storeStatus: store.storeStatus,
      newStoreConfidence: store.confidence,
      contactsUpserted,
      schemaReady: true,
      schemaHint: '已打分但未回写 store_status 列（迁移未执行）。',
    };
  }
  if (patchErr) throw patchErr;

  return {
    leadId,
    contacts,
    storeStatus: store.storeStatus,
    newStoreConfidence: store.confidence,
    contactsUpserted,
    schemaReady: true,
  };
}

function emptyResult(leadId: string, hint: string): CrossValidateLeadResult {
  return {
    leadId,
    contacts: [],
    storeStatus: 'unknown',
    newStoreConfidence: null,
    contactsUpserted: 0,
    schemaReady: false,
    schemaHint: hint,
  };
}

export function evidenceRowsFromSkipTrace(
  leadId: string,
  phones: { value: string; confidenceRaw: number | null }[],
  emails: { value: string; confidenceRaw: number | null }[],
): Omit<LeadEvidence, 'id' | 'created_at'>[] {
  const now = new Date().toISOString();
  return [
    ...phones.map((p) => ({
      lead_id: leadId,
      field: 'phone' as const,
      value: p.value,
      source: 'batchdata' as const,
      fetched_at: now,
      confidence_raw: p.confidenceRaw,
      raw_payload: null,
    })),
    ...emails.map((e) => ({
      lead_id: leadId,
      field: 'email' as const,
      value: e.value,
      source: 'batchdata' as const,
      fetched_at: now,
      confidence_raw: e.confidenceRaw,
      raw_payload: null,
    })),
  ];
}
