import type { SupabaseClient } from '@supabase/supabase-js';
import { isMissingSchemaError } from '@/lib/evidence/postgres-errors';

/** 富化写回白名单；显式排除人工字段 */
export const ENRICHMENT_MERGE_ALLOWED = [
  'owner_person_name',
  'owner_entity_name',
  'ai_classification',
  'new_store_confidence',
  'phone',
  'is_restaurant_confidence',
  'lead_score',
  'apn',
] as const;

export type EnrichmentMergeField = (typeof ENRICHMENT_MERGE_ALLOWED)[number];

const ALLOWED_SET = new Set<string>(ENRICHMENT_MERGE_ALLOWED);

export function isLeadEnrichMergeEnabled(): boolean {
  return process.env.ENABLE_LEAD_ENRICH_MERGE === '1';
}

export function pickEnrichmentMergeFields(
  fields: Record<string, unknown>,
): Partial<Record<EnrichmentMergeField, unknown>> {
  const out: Partial<Record<EnrichmentMergeField, unknown>> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!ALLOWED_SET.has(key)) continue;
    if (value === undefined) continue;
    (out as Record<string, unknown>)[key] = value;
  }
  return out;
}

export interface MergeEnrichmentResult {
  updated: boolean;
  skipped: boolean;
  schemaReady: boolean;
  schemaHint?: string;
}

/**
 * 对已存在 lead 做字段级 update（不走 upsert ignoreDuplicates）。
 * flag 由调用方检查；本函数本身不读 env。
 */
export async function mergeEnrichment(
  supabase: SupabaseClient,
  leadId: string,
  fields: Record<string, unknown>,
): Promise<MergeEnrichmentResult> {
  const patch = pickEnrichmentMergeFields(fields);
  if (Object.keys(patch).length === 0) {
    return { updated: false, skipped: true, schemaReady: true };
  }

  const { data: exists, error: existsErr } = await supabase
    .from('leads')
    .select('id')
    .eq('id', leadId)
    .maybeSingle();

  if (existsErr) {
    if (isMissingSchemaError(existsErr)) {
      return {
        updated: false,
        skipped: false,
        schemaReady: false,
        schemaHint: 'leads 表不可用，跳过富化写回。',
      };
    }
    throw existsErr;
  }

  if (!exists) {
    return { updated: false, skipped: true, schemaReady: true };
  }

  const { error: updateErr } = await supabase.from('leads').update(patch).eq('id', leadId);
  if (updateErr) {
    if (isMissingSchemaError(updateErr)) {
      return {
        updated: false,
        skipped: false,
        schemaReady: false,
        schemaHint: '部分富化列尚未迁移，未写回主表。',
      };
    }
    throw updateErr;
  }

  return { updated: true, skipped: false, schemaReady: true };
}
