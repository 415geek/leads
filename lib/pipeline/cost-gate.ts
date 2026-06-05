import type { ClassifiedDraft } from './classify';
import { scoreDraft } from './score';

/** 付费 enrichment 成本闸门；默认关，关时调用方应跳过本模块检查。 */
export function isLeadCostGateEnabled(): boolean {
  return process.env.ENABLE_LEAD_COST_GATE === '1';
}

const DEFAULT_THRESHOLD = 55;
const PAID_CACHE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export type PaidEnrichSource = 'google_places' | 'opencorporates' | 'whitepages' | 'anthropic';

export interface PaidEnrichSkipRecord {
  source: PaidEnrichSource;
  reason: 'below_score_threshold' | 'paid_cache_hit';
  leadKey: string;
  preScore: number;
  threshold: number;
}

interface UsageCounter {
  day: string;
  bySource: Record<PaidEnrichSource, number>;
  skippedBelowThreshold: number;
  skippedCacheHit: number;
}

let usage: UsageCounter = { day: '', bySource: { google_places: 0, opencorporates: 0, whitepages: 0, anthropic: 0 }, skippedBelowThreshold: 0, skippedCacheHit: 0 };

const paidDecisionCache = new Map<string, number>();

function todayKey(): string {
  return new Date().toISOString().split('T')[0];
}

function rollUsageDay(): void {
  const d = todayKey();
  if (usage.day === d) return;
  usage = {
    day: d,
    bySource: { google_places: 0, opencorporates: 0, whitepages: 0, anthropic: 0 },
    skippedBelowThreshold: 0,
    skippedCacheHit: 0,
  };
}

export function getEnrichScoreThreshold(): number {
  const raw = process.env.ENRICH_SCORE_THRESHOLD;
  if (raw == null || raw.trim() === '') return DEFAULT_THRESHOLD;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : DEFAULT_THRESHOLD;
}

export function normalizeLeadKey(name: string, address: string | null | undefined): string {
  const n = name.trim().toLowerCase().replace(/\s+/g, ' ');
  const a = (address ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  return `${n}::${a}`;
}

export interface PreEnrichScoreInput {
  draft: ClassifiedDraft['draft'];
  confidence: number | null;
  source_count?: number;
  is_chain?: boolean;
}

/** 富化前预估分（不含 Google Places enrichment 加分）。 */
export function preEnrichScore(input: PreEnrichScoreInput): number {
  return scoreDraft({
    draft: input.draft,
    confidence: input.confidence,
    hasEnrichment: false,
    source_count: input.source_count,
    is_chain: input.is_chain,
  });
}

export interface ShouldCallPaidEnrichResult {
  allowed: boolean;
  preScore: number;
  threshold: number;
  skipReason?: 'below_score_threshold';
  leadKey: string;
}

/**
 * 预估分是否达到付费 enrichment 阈值。
 * flag 关时由调用方直接 enrich，不应调用此函数。
 */
export function shouldCallPaidEnrich(
  input: PreEnrichScoreInput,
  source: PaidEnrichSource = 'google_places',
): ShouldCallPaidEnrichResult {
  rollUsageDay();
  const threshold = getEnrichScoreThreshold();
  const preScore = preEnrichScore(input);
  const leadKey = normalizeLeadKey(input.draft.name, input.draft.address);

  if (preScore < threshold) {
    usage.skippedBelowThreshold += 1;
    console.info(
      `[cost-gate] skip ${source} below_threshold score=${preScore} threshold=${threshold} lead=${leadKey}`,
    );
    return { allowed: false, preScore, threshold, skipReason: 'below_score_threshold', leadKey };
  }

  return { allowed: true, preScore, threshold, leadKey };
}

/** TTL 内是否已对同一店名+地址付过费（跨 source 去重）。 */
export function hasRecentPaidEnrich(source: PaidEnrichSource, leadKey: string): boolean {
  const cacheExpires = paidDecisionCache.get(`${source}::${leadKey}`);
  return cacheExpires != null && cacheExpires > Date.now();
}

export function recordPaidCacheSkip(source: PaidEnrichSource, leadKey: string): void {
  rollUsageDay();
  usage.skippedCacheHit += 1;
  console.info(`[cost-gate] skip ${source} paid_cache_hit lead=${leadKey}`);
}

/** 记录一次实际付费 API 调用，并写入 TTL 缓存避免重复计费。 */
export function recordPaidEnrichCall(
  source: PaidEnrichSource,
  leadKey: string,
  ttlMs: number = PAID_CACHE_TTL_MS,
): void {
  rollUsageDay();
  usage.bySource[source] = (usage.bySource[source] ?? 0) + 1;
  paidDecisionCache.set(`${source}::${leadKey}`, Date.now() + ttlMs);
  console.info(`[cost-gate] call ${source} lead=${leadKey} day_total=${usage.bySource[source]}`);
}

export function getCostGateUsageSnapshot(): {
  day: string;
  bySource: Record<PaidEnrichSource, number>;
  skippedBelowThreshold: number;
  skippedCacheHit: number;
  threshold: number;
} {
  rollUsageDay();
  return {
    day: usage.day,
    bySource: { ...usage.bySource },
    skippedBelowThreshold: usage.skippedBelowThreshold,
    skippedCacheHit: usage.skippedCacheHit,
    threshold: getEnrichScoreThreshold(),
  };
}

/** 测试辅助 */
export function _resetCostGateStateForTests(): void {
  usage = {
    day: '',
    bySource: { google_places: 0, opencorporates: 0, whitepages: 0, anthropic: 0 },
    skippedBelowThreshold: 0,
    skippedCacheHit: 0,
  };
  paidDecisionCache.clear();
}
