import {
  LA_DEFAULT_MAX_INSPECTION_ROWS,
  LA_INSPECTION_COUNT_PENALTY_PER_ROW,
  LA_NEW_FACILITY_BASE_CONFIDENCE,
  LA_RECENT_INSPECTIONS_CONFIDENCE,
} from '@/lib/opening-intel/config';
import type { LaOpeningSignals, LaImportStrategySignal } from '@/lib/opening-intel/types';

export function laMaxInspectionCountFromEnv(raw: string | undefined): number {
  const trimmed = raw?.trim();
  if (!trimmed) return LA_DEFAULT_MAX_INSPECTION_ROWS;
  const n = parseInt(trimmed, 10);
  return Number.isFinite(n) && n > 0 ? n : LA_DEFAULT_MAX_INSPECTION_ROWS;
}

/** 与 collectNewFacilityIds 内联逻辑等价（首检在窗口内 + 行数上限） */
export function laPassesNewFacilityHeuristic(args: {
  firstActivityMs: number;
  sinceMs: number;
  inspectionRowCount: number;
  maxInspectionRowsForNew: number;
}): boolean {
  if (args.firstActivityMs < args.sinceMs) return false;
  if (args.maxInspectionRowsForNew > 0 && args.inspectionRowCount > args.maxInspectionRowsForNew) {
    return false;
  }
  return true;
}

export function buildLaOpeningSignals(args: {
  strategy: LaImportStrategySignal;
  firstActivityMs: number;
  sinceMs: number;
  inspectionRowCount: number;
  maxInspectionRowsForNew?: number;
}): LaOpeningSignals {
  return {
    metro: 'la',
    strategy: args.strategy,
    firstActivityMs: args.firstActivityMs,
    sinceMs: args.sinceMs,
    inspectionRowCount: args.inspectionRowCount,
    maxInspectionRowsForNew: args.maxInspectionRowsForNew ?? LA_DEFAULT_MAX_INSPECTION_ROWS,
  };
}

export function laLegacyIncludeFacility(signals: LaOpeningSignals): boolean {
  if (signals.strategy === 'recent_inspections') return true;
  return laPassesNewFacilityHeuristic({
    firstActivityMs: signals.firstActivityMs,
    sinceMs: signals.sinceMs,
    inspectionRowCount: signals.inspectionRowCount,
    maxInspectionRowsForNew: signals.maxInspectionRowsForNew,
  });
}

export function laConfidenceFromSignals(signals: LaOpeningSignals): number {
  if (signals.strategy === 'recent_inspections') return LA_RECENT_INSPECTIONS_CONFIDENCE;
  if (!laPassesNewFacilityHeuristic(signals)) return 12;
  const over = Math.max(0, signals.inspectionRowCount - 1);
  const penalty = over * LA_INSPECTION_COUNT_PENALTY_PER_ROW;
  return Math.max(40, LA_NEW_FACILITY_BASE_CONFIDENCE - penalty);
}
