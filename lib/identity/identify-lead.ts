import type { SupabaseClient } from '@supabase/supabase-js';
import type { LeadEvidenceInsert } from '@/types/lead-evidence';
import { isMissingSchemaError } from '@/lib/evidence/postgres-errors';
import { collectIdentityHits, type LeadIdentityInput } from './collect-hits';
import { computeIdentityConsensus } from './consensus';
import { isLeadIdentifyGateEnabled } from './identify-gate';
import {
  ownerPersonCandidatesFromHits,
  resolveOwnerPerson,
} from './resolve-owner-person';

export function isLeadIdentifyEnabled(): boolean {
  return process.env.ENABLE_LEAD_IDENTIFY === '1';
}

export interface IdentifyLeadResult {
  leadId: string;
  entityName: string | null;
  personName: string | null;
  agreementScore: number;
  locked: boolean;
  evidenceInserted: number;
  ownerFieldsUpdated: boolean;
  schemaReady: boolean;
  schemaHint?: string;
  reviewReason: string | null;
  /** flag 开时：confirmed 才写 owner_person_name */
  ownerResolutionStatus?: 'confirmed' | 'review' | null;
}

function hitsToEvidence(leadId: string, hits: ReturnType<typeof computeIdentityConsensus>['hits']): LeadEvidenceInsert[] {
  const fetchedAt = new Date().toISOString();
  const rows: LeadEvidenceInsert[] = [];

  for (const h of hits) {
    if (h.entityName?.trim()) {
      rows.push({
        lead_id: leadId,
        field: 'owner_entity',
        value: h.entityName.trim(),
        source: h.source,
        fetched_at: fetchedAt,
        confidence_raw: h.confidenceRaw,
        raw_payload: h.rawPayload ?? null,
      });
    }
    if (h.personName?.trim()) {
      rows.push({
        lead_id: leadId,
        field: 'owner_name',
        value: h.personName.trim(),
        source: h.source,
        fetched_at: fetchedAt,
        confidence_raw: h.confidenceRaw,
        raw_payload: h.rawPayload ?? null,
      });
    }
  }

  return rows;
}

export async function identifyLeadById(
  supabase: SupabaseClient,
  leadId: string,
  opts: { fetchImpl?: typeof fetch; skipOc?: boolean } = {},
): Promise<IdentifyLeadResult> {
  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .select('id, name, metro_area, ca_entity_number, source, source_raw')
    .eq('id', leadId)
    .maybeSingle();

  if (leadErr) throw leadErr;
  if (!lead) {
    const err = new Error('Lead not found');
    (err as Error & { statusCode?: number }).statusCode = 404;
    throw err;
  }

  const input = lead as LeadIdentityInput & { id: string };
  const hits = await collectIdentityHits(
    { ...input, lead_id: input.id },
    opts,
  );
  const consensus = computeIdentityConsensus(hits, input.name);
  const evidenceRows = hitsToEvidence(leadId, consensus.hits);

  let evidenceInserted = 0;
  if (evidenceRows.length > 0) {
    const { error: insertErr } = await supabase.from('lead_evidence').insert(evidenceRows);
    if (insertErr) {
      if (isMissingSchemaError(insertErr)) {
        return {
          leadId,
          entityName: consensus.entityName,
          personName: consensus.personName,
          agreementScore: consensus.agreementScore,
          locked: consensus.locked,
          evidenceInserted: 0,
          ownerFieldsUpdated: false,
          schemaReady: false,
          schemaHint: 'lead_evidence 表不存在，请在 Supabase SQL Editor 执行 20260602000000_lead_evidence.sql',
          reviewReason: consensus.reviewReason,
        };
      }
      throw insertErr;
    }
    evidenceInserted = evidenceRows.length;
  }

  let ownerFieldsUpdated = false;
  let ownerResolutionStatus: 'confirmed' | 'review' | null = null;
  let reviewReason = consensus.reviewReason;

  const personResolution = isLeadIdentifyGateEnabled()
    ? resolveOwnerPerson(ownerPersonCandidatesFromHits(consensus.hits))
    : null;

  if (personResolution) {
    ownerResolutionStatus = personResolution.status;
    if (personResolution.status !== 'confirmed') {
      reviewReason = personResolution.evidence.disagreeing.length
        ? 'owner_person_sources_disagree'
        : 'owner_person_single_source';
    }
  }

  if (consensus.locked) {
    const patch: Record<string, string> = {};
    if (consensus.entityName) patch.owner_entity_name = consensus.entityName;

    const personToWrite = isLeadIdentifyGateEnabled()
      ? personResolution?.status === 'confirmed'
        ? personResolution.person
        : null
      : consensus.personName;

    if (personToWrite) patch.owner_person_name = personToWrite;

    if (Object.keys(patch).length > 0) {
      const { error: patchErr } = await supabase.from('leads').update(patch).eq('id', leadId);
      if (patchErr && isMissingSchemaError(patchErr)) {
        return {
          leadId,
          entityName: consensus.entityName,
          personName: consensus.personName,
          agreementScore: consensus.agreementScore,
          locked: consensus.locked,
          evidenceInserted,
          ownerFieldsUpdated: false,
          schemaReady: true,
          schemaHint: '证据已写入，但 owner_* 列未迁移，未回写主表。',
          reviewReason,
        };
      }
      if (patchErr) throw patchErr;
      ownerFieldsUpdated = true;
    }
  }

  return {
    leadId,
    entityName: consensus.entityName,
    personName: isLeadIdentifyGateEnabled()
      ? personResolution?.status === 'confirmed'
        ? personResolution.person
        : null
      : consensus.personName,
    agreementScore: consensus.agreementScore,
    locked: consensus.locked,
    evidenceInserted,
    ownerFieldsUpdated,
    schemaReady: true,
    reviewReason,
    ownerResolutionStatus,
  };
}
