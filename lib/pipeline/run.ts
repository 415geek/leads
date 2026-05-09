/**
 * Pipeline Orchestrator — V2 Pro (7-step)
 *
 *   SOURCE_REGISTRY (14+ metros, 20+ sources)
 *       │
 *       ▼ ingest() — parallel, error-isolated per source (Promise.allSettled)
 *   NormalizedDraft[]
 *       │
 *       ▼ classify() — Claude Haiku, 20-batch, 24h cache
 *         is_restaurant=true AND confidence > 0.6 → continue
 *       │
 *       ▼ cross_validate() — ZIP-code blocking, token-set-ratio ≥ 85
 *         → source_count, source_ids, multi_source_bonus in scoreV3
 *       │
 *       ▼ chain_detect() — 500-entry blocklist, fuzzy match ≥ 85
 *         → is_chain, chain_name; -15 penalty in scoreV3
 *       │
 *       ▼ enrich() — Google Places, 90d cache, daily cap=3000
 *       │
 *       ▼ scoreV3() — 7 factors, Math.max(0, Math.min(100, raw))
 *       │
 *       ▼ upsert → Supabase leads + lead_enrichment
 *
 * Invariants:
 *   - One source failure never blocks others (Promise.allSettled)
 *   - classify=false drafts never reach Google Places (cost gate)
 *   - cross_validate crash → draft passes through with source_count=1 (non-blocking)
 *   - chain_detect crash → is_chain=false for all (non-blocking)
 *   - Phase 1: classify/enrich are pass-throughs (no API keys required)
 */

import { ingestAll } from './ingest';
import { classifyDrafts } from './classify';
import type { ClassifiedDraft } from './classify';
import { crossValidateDrafts } from './cross-validate';
import type { CrossValidatedDraft } from './cross-validate';
import { detectChains } from './chain-detect';
import { enrichDrafts } from './enrich';
import { scoreDraft } from './score';
import type { FoodDataSource, NormalizedDraft, SourceFetchResult } from '@/lib/sources/types';
import { enabledSources } from '@/lib/sources/registry';

export interface PipelineLead extends NormalizedDraft {
  lead_score: number;
  is_restaurant_confidence: number | null;
  ai_classification: Record<string, unknown> | null;
  source_count: number;
  source_ids: string[];
  is_chain: boolean;
  chain_name: string | null;
}

export interface PipelineRunResult {
  sinceDate: string;
  sourceResults: SourceFetchResult[];
  leads: PipelineLead[];
  droppedNonRestaurant: number;
  enrichmentCalls: number;
  chainsDetected: number;
  crossValidated: number;
}

export interface PipelineOptions {
  sourceIds?: string[];
  singleSourceId?: string;
  lookbackDays?: number;
  skipClassify?: boolean;
  skipEnrich?: boolean;
  skipCrossValidate?: boolean;
  skipChainDetect?: boolean;
}

function selectSources(opts: PipelineOptions): readonly FoodDataSource[] {
  const all = enabledSources();
  const ids = opts.singleSourceId ? [opts.singleSourceId] : opts.sourceIds;
  if (!ids?.length) return all;
  return all.filter((s) => ids.includes(s.id));
}

function computeSinceDate(lookbackDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() - lookbackDays);
  return d.toISOString().split('T')[0];
}

function passThruCrossValidate(drafts: ClassifiedDraft[]): CrossValidatedDraft[] {
  return drafts.map((c) => ({ ...c, source_count: 1, source_ids: [c.draft.source] }));
}

export async function runPipeline(
  opts: PipelineOptions = {},
): Promise<PipelineRunResult> {
  const sources = selectSources(opts);
  const defaultLookback = opts.lookbackDays ?? 30;
  const sinceDate = computeSinceDate(defaultLookback);

  // 1. Ingest — concurrent, error-isolated
  const { sourceResults, drafts } = await ingestAll(sources, { lookbackDays: defaultLookback });

  // 2. Classify
  const classified: ClassifiedDraft[] = opts.skipClassify
    ? drafts.map((d) => ({ draft: d, is_restaurant: true as const, confidence: null, raw: null }))
    : await classifyDrafts(drafts);

  const kept = classified.filter((c) => c.is_restaurant);
  const dropped = classified.length - kept.length;

  // 3. Cross-validate
  let crossValidatedDrafts: CrossValidatedDraft[];
  let crossValidationStats = 0;
  if (!opts.skipCrossValidate) {
    try {
      const cv = crossValidateDrafts(kept);
      crossValidationStats = cv.filter((d) => d.source_count >= 2).length;
      crossValidatedDrafts = cv;
    } catch (err) {
      console.warn('[pipeline] cross-validate failed, skipping:', err);
      crossValidatedDrafts = passThruCrossValidate(kept);
    }
  } else {
    crossValidatedDrafts = passThruCrossValidate(kept);
  }

  // 4. Chain detect
  let chainDetectedDrafts: CrossValidatedDraft[];
  let chainsCount = 0;
  if (!opts.skipChainDetect) {
    try {
      const cd = detectChains(crossValidatedDrafts);
      chainsCount = cd.filter((d) => d.is_chain).length;
      chainDetectedDrafts = cd;
    } catch (err) {
      console.warn('[pipeline] chain-detect failed, skipping:', err);
      chainDetectedDrafts = crossValidatedDrafts.map((c) => ({
        ...c,
        is_chain: false,
        chain_name: null,
      }));
    }
  } else {
    chainDetectedDrafts = crossValidatedDrafts.map((c) => ({
      ...c,
      is_chain: false,
      chain_name: null,
    }));
  }

  // 5. Enrich
  const enriched = opts.skipEnrich
    ? chainDetectedDrafts.map((c) => ({ ...c, enrichment: null }))
    : await enrichDrafts(chainDetectedDrafts);

  const enrichmentCalls = enriched.filter((e) => e.enrichment?.fetched).length;

  // 6. ScoreV3 + assemble PipelineLead
  const leads: PipelineLead[] = enriched.map((e) => {
    const c = e as typeof e & {
      source_count?: number;
      source_ids?: string[];
      is_chain?: boolean;
      chain_name?: string | null;
    };

    const cls = (e.raw as Record<string, unknown> | null) ?? null;
    const mergedCls: Record<string, unknown> = { ...(cls ?? {}) };
    if (e.draft.opening_signals) mergedCls.datasf_opening = e.draft.opening_signals;
    if (e.draft.houston_opening) mergedCls.houston_opening = e.draft.houston_opening;
    if (
      e.draft.houston_opening?.display_status === 'pre-opening' &&
      e.enrichment?.business_status === 'OPERATIONAL'
    ) {
      mergedCls.houston_google_signals = {
        soft_opening: true,
        google_business_status: e.enrichment.business_status,
      };
    }
    if (c.is_chain) mergedCls.chain_name = c.chain_name;

    const source_count = c.source_count ?? 1;
    const source_ids = c.source_ids ?? [e.draft.source];
    const is_chain = c.is_chain ?? false;
    const chain_name = c.chain_name ?? null;
    const ai_classification = Object.keys(mergedCls).length ? mergedCls : null;

    return {
      ...e.draft,
      phone: e.enrichment?.formatted_phone ?? e.draft.phone,
      is_restaurant_confidence: e.confidence,
      ai_classification,
      source_count,
      source_ids,
      is_chain,
      chain_name,
      lead_score: scoreDraft({
        draft: e.draft,
        confidence: e.confidence,
        hasEnrichment: !!e.enrichment && e.enrichment.business_status === 'OPERATIONAL',
        source_count,
        is_chain,
      }),
    };
  });

  return {
    sinceDate,
    sourceResults,
    leads,
    droppedNonRestaurant: dropped,
    enrichmentCalls,
    chainsDetected: chainsCount,
    crossValidated: crossValidationStats,
  };
}
