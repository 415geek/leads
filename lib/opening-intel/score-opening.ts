import {
  nycConfidenceFromRank,
  nycIsLikelyNewFromRank,
  nycLabelFromRank,
} from '@/lib/opening-intel/nyc';
import { laConfidenceFromSignals, laLegacyIncludeFacility } from '@/lib/opening-intel/la';
import {
  houstonConfidenceFromStatus,
  houstonIsLikelyNewFromStatus,
} from '@/lib/opening-intel/houston';
import type { OpeningScoreResult, OpeningSignals } from '@/lib/opening-intel/types';

function scoreNyc(signals: Extract<OpeningSignals, { metro: 'nyc' }>): OpeningScoreResult {
  const rank = signals.priorityRank;
  const confidence = nycConfidenceFromRank(rank);
  const label = nycLabelFromRank(rank);
  const reasons: string[] = [
    `NYC inspection_type=${signals.inspectionType}`,
    `category=${signals.category}`,
    `phase=${signals.phase}`,
    `priority_rank=${rank}`,
  ];
  return {
    newStoreConfidence: confidence,
    isLikelyNewStore: nycIsLikelyNewFromRank(rank),
    reasons,
    openingLabel: label,
  };
}

function scoreLa(signals: Extract<OpeningSignals, { metro: 'la' }>): OpeningScoreResult {
  const include = laLegacyIncludeFacility(signals);
  const confidence = laConfidenceFromSignals(signals);
  const reasons: string[] = [
    `LA strategy=${signals.strategy}`,
    `first_activity_ms=${signals.firstActivityMs}`,
    `since_ms=${signals.sinceMs}`,
    `inspection_rows=${signals.inspectionRowCount}`,
  ];
  if (signals.strategy === 'new_facilities') {
    reasons.push(
      include
        ? 'passes new-facility heuristic'
        : 'filtered: not first-in-window or too many inspection rows',
    );
  }
  return {
    newStoreConfidence: confidence,
    isLikelyNewStore: include,
    reasons,
    openingLabel: include ? 'likely_new_opening' : 'weak_signal',
  };
}

function scoreHouston(signals: Extract<OpeningSignals, { metro: 'houston' }>): OpeningScoreResult {
  const status = signals.displayStatus;
  const confidence = houstonConfidenceFromStatus(status);
  return {
    newStoreConfidence: confidence,
    isLikelyNewStore: houstonIsLikelyNewFromStatus(status),
    reasons: [`Houston display_status=${status}`],
    openingLabel: status,
  };
}

/** 各 metro 归一化信号 → 统一 0–100 新店置信度 */
export function scoreOpening(signals: OpeningSignals): OpeningScoreResult {
  switch (signals.metro) {
    case 'nyc':
      return scoreNyc(signals);
    case 'la':
      return scoreLa(signals);
    case 'houston':
      return scoreHouston(signals);
    default: {
      const _exhaustive: never = signals;
      return _exhaustive;
    }
  }
}
