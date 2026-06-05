import type { NewOpeningLabel } from '@/lib/datasf-opening-intel';
import type { HoustonOpeningDisplayStatus } from '@/lib/houston-opening-intel';

export type OpeningMetro = 'nyc' | 'la' | 'houston';

export type NycInspectionCategory =
  | 'pre_permit_non_operational'
  | 'pre_permit_operational'
  | 'cycle'
  | 'unknown';

export type NycInspectionPhase = 'initial' | 're_inspection' | 'unknown';

export interface OpeningScoreResult {
  newStoreConfidence: number;
  isLikelyNewStore: boolean;
  reasons: string[];
  /** 与 score.ts opening bonus 对齐的标签（若适用） */
  openingLabel?: NewOpeningLabel | HoustonOpeningDisplayStatus | 'existing_permit_renewal';
}

export interface NycOpeningSignals {
  metro: 'nyc';
  inspectionType: string;
  category: NycInspectionCategory;
  phase: NycInspectionPhase;
  priorityRank: number;
}

export type LaImportStrategySignal = 'new_facilities' | 'recent_inspections';

export interface LaOpeningSignals {
  metro: 'la';
  strategy: LaImportStrategySignal;
  firstActivityMs: number;
  sinceMs: number;
  inspectionRowCount: number;
  maxInspectionRowsForNew: number;
}

export interface HoustonOpeningSignals {
  metro: 'houston';
  displayStatus: HoustonOpeningDisplayStatus;
}

export type OpeningSignals = NycOpeningSignals | LaOpeningSignals | HoustonOpeningSignals;
