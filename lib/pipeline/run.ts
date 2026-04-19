/**
 * Pipeline Orchestrator —— 全美新餐饮情报层
 *
 * 数据流：
 *
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │ SOURCE_REGISTRY                                              │
 *   │   SF(DataSF) · Berkeley · Houston · NYC · LA · Chicago ...   │
 *   └────────────────────┬────────────────────────────────────────┘
 *                        │ ingest() 并发拉取（每源独立错误隔离）
 *                        ▼
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │ NormalizedDraft[]  （统一 schema：external_id / metro ... ） │
 *   └────────────────────┬────────────────────────────────────────┘
 *                        │ classify()  Phase 2 接入 Claude Haiku
 *                        ▼
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │ is_restaurant=true  AND  confidence > 0.6  才继续下一步       │
 *   └────────────────────┬────────────────────────────────────────┘
 *                        │ enrich()  Phase 2 接入 Google Places + 缓存 + 预算闸门
 *                        ▼
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │ score()  scoreV2：freshness + AI conf + enrichment + phone   │
 *   └────────────────────┬────────────────────────────────────────┘
 *                        │ upsert (source, external_id) 主键
 *                        ▼
 *                    Supabase leads + lead_enrichment
 *
 * 关键不变量：
 *   - 一源失败不拖累其他（Promise.allSettled）
 *   - classify=false 的 draft 在 Phase 2 启用后**不会**触发 Google Places 调用（成本闸门）
 *   - Phase 1 时 classify/enrich 是 pass-through（透传），行为与旧 pipeline 一致
 */

import { ingestAll } from './ingest';
import { classifyDrafts } from './classify';
import { enrichDrafts } from './enrich';
import { scoreDraft } from './score';
import type { FoodDataSource, NormalizedDraft, SourceFetchResult } from '@/lib/sources/types';
import { enabledSources } from '@/lib/sources/registry';

export interface PipelineLead extends NormalizedDraft {
  lead_score: number;
  is_restaurant_confidence: number | null;
  ai_classification: Record<string, unknown> | null;
}

export interface PipelineRunResult {
  sinceDate: string;
  sourceResults: SourceFetchResult[];
  leads: PipelineLead[];
  /** 被 AI 分类器判为非餐厅而丢弃的条数 */
  droppedNonRestaurant: number;
  /** 本次 enrichment 实际调用 Google Places 的次数（成本观测） */
  enrichmentCalls: number;
}

export interface PipelineOptions {
  /** 只跑指定源；为空 → 跑 registry 里所有 enabled 源 */
  sourceIds?: string[];
  /** 语法糖：只跑一个源 —— 等价于 sourceIds: [id]，让调用点更清晰 */
  singleSourceId?: string;
  /** lookback 天数；默认 30 */
  lookbackDays?: number;
  /**
   * skipClassify/skipEnrich：
   *   - 交互式 import 默认 true（跳过，避免 Vercel 函数超时；AI 留给后续 reclassify 任务）
   *   - cron 或 /reclassify 路径可显式设为 false
   */
  skipClassify?: boolean;
  skipEnrich?: boolean;
}

function selectSources(opts: PipelineOptions): readonly FoodDataSource[] {
  const all = enabledSources();
  const ids: string[] | undefined = opts.singleSourceId
    ? [opts.singleSourceId]
    : opts.sourceIds;
  if (!ids?.length) return all;
  return all.filter((s) => ids.includes(s.id));
}

function computeSinceDate(lookbackDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() - lookbackDays);
  return d.toISOString().split('T')[0];
}

export async function runPipeline(
  opts: PipelineOptions = {},
): Promise<PipelineRunResult> {
  const sources = selectSources(opts);
  const sinceDate = computeSinceDate(opts.lookbackDays ?? 30);

  // 1. ingest —— 并发拉取，错误隔离
  const { sourceResults, drafts } = await ingestAll(sources, { sinceDate });

  // 2. classify —— Phase 1 pass-through；Phase 2 接 Claude Haiku
  const classified = opts.skipClassify
    ? drafts.map((d) => ({ draft: d, is_restaurant: true as const, confidence: null, raw: null }))
    : await classifyDrafts(drafts);

  const kept = classified.filter((c) => c.is_restaurant);
  const dropped = classified.length - kept.length;

  // 3. enrich —— Phase 1 pass-through；Phase 2 接 Google Places（只对 kept 调用，是成本闸门）
  const enriched = opts.skipEnrich
    ? kept.map((c) => ({ ...c, enrichment: null }))
    : await enrichDrafts(kept);

  const enrichmentCalls = enriched.filter((e) => e.enrichment?.fetched).length;

  // 4. score
  const leads: PipelineLead[] = enriched.map((e) => ({
    ...e.draft,
    phone: e.enrichment?.formatted_phone ?? e.draft.phone,
    is_restaurant_confidence: e.confidence,
    ai_classification: e.raw as Record<string, unknown> | null,
    lead_score: scoreDraft({
      draft: e.draft,
      confidence: e.confidence,
      hasEnrichment: !!e.enrichment && e.enrichment.business_status === 'OPERATIONAL',
    }),
  }));

  return {
    sinceDate,
    sourceResults,
    leads,
    droppedNonRestaurant: dropped,
    enrichmentCalls,
  };
}
