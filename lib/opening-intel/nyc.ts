import { pickText } from '@/lib/bay-area-food-import/shared';
import type { NewOpeningLabel } from '@/lib/datasf-opening-intel';
import {
  NYC_LIKELY_NEW_MAX_RANK,
  NYC_RANK_TO_CONFIDENCE,
  NYC_RANK_TO_LABEL,
} from '@/lib/opening-intel/config';
import type {
  NycInspectionCategory,
  NycInspectionPhase,
  NycOpeningSignals,
} from '@/lib/opening-intel/types';

export type { NycInspectionCategory, NycInspectionPhase };

export function parseNycCategory(text: string): NycInspectionCategory {
  const t = text.toLowerCase();
  if (t.includes('pre-permit') && t.includes('non-operational')) return 'pre_permit_non_operational';
  if (t.includes('pre-permit') && t.includes('operational')) return 'pre_permit_operational';
  if (t.includes('cycle inspection')) return 'cycle';
  return 'unknown';
}

export function parseNycPhase(text: string): NycInspectionPhase {
  const t = text.toLowerCase();
  if (t.includes('re-inspection') || t.includes('reinspection')) return 're_inspection';
  if (t.includes('initial inspection')) return 'initial';
  return 'unknown';
}

export function nycPriorityRank(
  category: NycInspectionCategory,
  phase: NycInspectionPhase,
): number {
  if (category === 'pre_permit_non_operational') return phase === 're_inspection' ? 2 : 1;
  if (category === 'pre_permit_operational') return phase === 're_inspection' ? 4 : 3;
  if (category === 'cycle') return phase === 're_inspection' ? 6 : 5;
  return 99;
}

export function buildNycOpeningSignals(raw: string | null | undefined): NycOpeningSignals {
  const inspectionType = pickText(raw) || 'unknown';
  const category = parseNycCategory(inspectionType);
  const phase = parseNycPhase(inspectionType);
  const priorityRank = nycPriorityRank(category, phase);
  return { metro: 'nyc', inspectionType, category, phase, priorityRank };
}

export function nycLabelFromRank(rank: number): NewOpeningLabel {
  return NYC_RANK_TO_LABEL[rank]?.label ?? 'weak_signal';
}

export function nycConfidenceFromRank(rank: number): number {
  return NYC_RANK_TO_CONFIDENCE[rank] ?? 10;
}

export function nycIsLikelyNewFromRank(rank: number): boolean {
  return rank <= NYC_LIKELY_NEW_MAX_RANK;
}
