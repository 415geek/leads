/**
 * scoreV2 —— 全美情报层升级版评分（0..100）
 *
 * 输入权重：
 *   40 × freshness(first_inspection_date OR license_date)
 *     ≤7 天=1.0, ≤14=0.875, ≤30=0.75, ≤60=0.5, ≤90=0.25, 其他=0
 *   25 × ai_classification_confidence    // Phase 1 pass-through 时 confidence=null → 记 0.8 作基准
 *   15 × metro_weight                     // sf_bay/nyc/la=1.0, houston/chicago/boston/seattle/austin=0.67
 *   10 × has_enrichment                   // Google 命中且 OPERATIONAL
 *   10 × has_phone                        // 有联系电话
 *
 * 与旧 lib/scoring.ts 的对比：
 *   - 不再加"中餐 +30"硬分：菜系是筛选维度，不进评分
 *   - 用 first_inspection_date 兜底 license_date：inspection 类数据源常常没有 license_date
 *   - confidence=null（Phase 1）给基准 0.8，避免 Phase 1 阶段评分整体塌陷
 */

import type { MetroArea, NormalizedDraft } from '@/lib/sources/types';

const METRO_WEIGHT: Record<MetroArea, number> = {
  sf_bay: 1.0,
  nyc: 1.0,
  la: 1.0,
  houston: 0.67,
  chicago: 0.67,
  boston: 0.67,
  seattle: 0.67,
  austin: 0.67,
};

function freshnessFactor(dateStr: string | null): number {
  if (!dateStr) return 0;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return 0;
  const days = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (days < 0) return 1.0; // 未来日期（数据源错误）：当作最新
  if (days <= 7) return 1.0;
  if (days <= 14) return 0.875;
  if (days <= 30) return 0.75;
  if (days <= 60) return 0.5;
  if (days <= 90) return 0.25;
  return 0;
}

export interface ScoreInput {
  draft: NormalizedDraft;
  /** AI 分类器置信度；null = Phase 1 pass-through，给 0.8 基准；0..1 = Phase 2 真实值 */
  confidence: number | null;
  /** Google Places 命中且 OPERATIONAL */
  hasEnrichment: boolean;
}

function datasfOpeningBonus(draft: NormalizedDraft): number {
  if (draft.source !== 'sf_gov' || !draft.opening_signals) return 0;
  switch (draft.opening_signals.new_opening_label) {
    case 'confirmed_new_opening':
      return 10;
    case 'likely_new_opening':
      return 6;
    case 'possible_new_opening':
      return 0;
    case 'weak_signal':
      return -10;
    default:
      return 0;
  }
}

export function scoreDraft(input: ScoreInput): number {
  const { draft, confidence, hasEnrichment } = input;

  const freshDate = draft.first_inspection_date ?? draft.license_date;
  const fresh = freshnessFactor(freshDate);

  // Phase 1 pass-through：confidence=null 记 0.8 基准；Phase 2 真实值
  const conf = confidence ?? 0.8;

  const metroW = METRO_WEIGHT[draft.metro_area] ?? 0.5;

  const hasPhone = !!draft.phone;

  const base =
    40 * fresh +
    25 * Math.max(0, Math.min(1, conf)) +
    15 * metroW +
    (hasEnrichment ? 10 : 0) +
    (hasPhone ? 10 : 0);

  const score = base + datasfOpeningBonus(draft);

  return Math.round(Math.max(0, Math.min(100, score)));
}
