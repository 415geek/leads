/**
 * Enrich 层 —— 补充 Google Places 信息（电话 / 营业状态 / 类目）
 *
 * Phase 1: pass-through（enrichment=null）—— 行为与旧 pipeline 一致
 * Phase 2: 接 Google Places Text Search + Supabase 表缓存 90 天 + daily-cap 熔断
 *
 * 成本闸门（三道，Phase 2 实装）：
 *   1. 只对 is_restaurant=true 的 ClassifiedDraft 调用（由调用方保证）
 *   2. lead_enrichment.fetched_at 90 天内有缓存 → 跳过
 *   3. daily-cap：当日累计调用 >= GOOGLE_PLACES_DAILY_CAP 立即熔断
 */

import type { ClassifiedDraft } from './classify';
import {
  _resetCostGateStateForTests,
  hasRecentPaidEnrich,
  isLeadCostGateEnabled,
  normalizeLeadKey,
  recordPaidCacheSkip,
  recordPaidEnrichCall,
  shouldCallPaidEnrich,
  type PreEnrichScoreInput,
} from './cost-gate';

export interface EnrichmentResult {
  /** 本次是否实际调了外部 API（true = 花了钱；false = 缓存/跳过） */
  fetched: boolean;
  google_place_id: string | null;
  formatted_phone: string | null;
  business_status: 'OPERATIONAL' | 'CLOSED_TEMPORARILY' | 'CLOSED_PERMANENTLY' | null;
  google_types: string[] | null;
  raw: Record<string, unknown> | null;
}

/** 可选 cross-validate / chain 字段，供成本闸门预估分使用。 */
export interface EnrichableDraft extends ClassifiedDraft {
  source_count?: number;
  is_chain?: boolean;
}

export interface EnrichedDraft extends EnrichableDraft {
  enrichment: EnrichmentResult | null;
}

export interface EnricherClient {
  enrich(draft: ClassifiedDraft): Promise<EnrichmentResult | null>;
}

/**
 * 默认 enricher：
 *   - 有 GOOGLE_PLACES_API_KEY → Google Places Text Search（Phase 2）
 *   - 无 key → null（pass-through）
 */
export function defaultEnricher(): EnricherClient | null {
  if (!process.env.GOOGLE_PLACES_API_KEY) return null;
  return createGooglePlacesEnricher();
}

export async function enrichDrafts(
  kept: readonly EnrichableDraft[],
  opts: { client?: EnricherClient | null } = {},
): Promise<EnrichedDraft[]> {
  const client = opts.client === undefined ? defaultEnricher() : opts.client;

  if (!client) {
    return kept.map((c) => ({ ...c, enrichment: null }));
  }

  const costGate = isLeadCostGateEnabled();
  const out: EnrichedDraft[] = [];
  for (const c of kept) {
    try {
      if (costGate) {
        const gateInput: PreEnrichScoreInput = {
          draft: c.draft,
          confidence: c.confidence,
          source_count: c.source_count,
          is_chain: c.is_chain,
        };
        const gate = shouldCallPaidEnrich(gateInput, 'google_places');
        if (!gate.allowed) {
          out.push({ ...c, enrichment: null });
          continue;
        }
      }
      const enrichment = await client.enrich(c);
      out.push({ ...c, enrichment });
    } catch (err) {
      // enrich 失败绝不能让 lead 丢失 —— lead 仍入库，enrichment=null
      console.warn('[enrich] draft enrich failed:', c.draft.name, err);
      out.push({ ...c, enrichment: null });
    }
  }
  return out;
}

// ============================================================================
// Google Places Enricher —— 三道成本闸门
//   闸门 1：调用方只传 is_restaurant=true 的 ClassifiedDraft（由 run.ts 保证）
//   闸门 2：进程内缓存（90d 模拟；生产环境应用 lead_enrichment 表的 fetched_at）
//   闸门 3：daily-cap —— 达到阈值直接熔断，返回 null（lead 仍入库）
// ============================================================================

interface EnrichCacheEntry {
  result: EnrichmentResult;
  expiresAt: number;
}

const enrichCache = new Map<string, EnrichCacheEntry>();
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

interface DailyCallCounter {
  day: string;
  count: number;
}

let dailyCounter: DailyCallCounter = { day: '', count: 0 };

function todayKey(): string {
  return new Date().toISOString().split('T')[0];
}

function bumpDailyCounterAndCheck(cap: number): boolean {
  const d = todayKey();
  if (dailyCounter.day !== d) dailyCounter = { day: d, count: 0 };
  if (dailyCounter.count >= cap) return false;
  dailyCounter.count += 1;
  return true;
}

function cacheKey(c: ClassifiedDraft): string {
  const d = c.draft;
  return d.external_id
    ? `${d.source}::${d.external_id}`
    : `${(d.name || '').toLowerCase()}::${(d.address || '').toLowerCase()}::${(d.city || '').toLowerCase()}`;
}

interface PlacesConfig {
  apiKey: string;
  dailyCap: number;
  fetchImpl?: typeof fetch;
}

function loadConfig(): PlacesConfig {
  return {
    apiKey: process.env.GOOGLE_PLACES_API_KEY || '',
    dailyCap: parseInt(process.env.GOOGLE_PLACES_DAILY_CAP || '3000', 10),
  };
}

/** 可注入 fetch / config 以便单测 */
export function createGooglePlacesEnricher(
  overrides: Partial<PlacesConfig> = {},
): EnricherClient {
  const cfg: PlacesConfig = { ...loadConfig(), ...overrides };
  const fetchImpl = cfg.fetchImpl ?? globalThis.fetch;

  return {
    async enrich(c) {
      // 闸门 1 已由上层保证（此处仅断言）
      if (!c.is_restaurant) return null;

      // 闸门 2：进程内 Places 缓存命中
      const key = cacheKey(c);
      const cached = enrichCache.get(key);
      if (cached && cached.expiresAt > Date.now()) {
        return { ...cached.result, fetched: false };
      }

      const paidKey = normalizeLeadKey(c.draft.name, c.draft.address);
      if (isLeadCostGateEnabled() && hasRecentPaidEnrich('google_places', paidKey)) {
        recordPaidCacheSkip('google_places', paidKey);
        return null;
      }

      // 闸门 3：日预算熔断
      if (!bumpDailyCounterAndCheck(cfg.dailyCap)) {
        console.warn('[enrich] daily cap reached, skipping Google Places call');
        return null;
      }

      if (!cfg.apiKey) return null;

      try {
        const query = encodeURIComponent(
          `${c.draft.name} ${c.draft.address ?? ''} ${c.draft.city ?? ''}`.trim(),
        );
        const url =
          'https://maps.googleapis.com/maps/api/place/textsearch/json' +
          `?query=${query}&key=${cfg.apiKey}`;
        const res = await fetchImpl(url);
        if (!res.ok) {
          console.warn('[enrich] Places HTTP', res.status);
          return null;
        }
        const json = (await res.json()) as {
          status?: string;
          results?: Array<{
            place_id?: string;
            formatted_phone_number?: string;
            international_phone_number?: string;
            business_status?: string;
            types?: string[];
            formatted_address?: string;
            name?: string;
          }>;
          error_message?: string;
        };

        if (json.status && json.status !== 'OK' && json.status !== 'ZERO_RESULTS') {
          console.warn('[enrich] Places status:', json.status, json.error_message);
          return null;
        }

        const top = json.results?.[0];
        if (!top) return null;

        const result: EnrichmentResult = {
          fetched: true,
          google_place_id: top.place_id ?? null,
          formatted_phone:
            top.formatted_phone_number ?? top.international_phone_number ?? null,
          business_status:
            (top.business_status as EnrichmentResult['business_status']) ?? 'OPERATIONAL',
          google_types: top.types ?? null,
          raw: top as Record<string, unknown>,
        };

        enrichCache.set(key, {
          result,
          expiresAt: Date.now() + NINETY_DAYS_MS,
        });

        if (isLeadCostGateEnabled()) {
          recordPaidEnrichCall('google_places', paidKey);
        }

        return result;
      } catch (err) {
        console.warn('[enrich] fetch error:', err);
        return null;
      }
    },
  };
}

/** 测试辅助：清空 enrichment 缓存 + 每日计数器 */
export function _resetEnrichStateForTests(): void {
  enrichCache.clear();
  dailyCounter = { day: '', count: 0 };
  _resetCostGateStateForTests();
}

/** 观测：当前日调用计数（cron 总结日志用） */
export function getDailyEnrichCount(): { day: string; count: number } {
  return { ...dailyCounter };
}
