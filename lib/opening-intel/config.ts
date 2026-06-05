import type { NewOpeningLabel } from '@/lib/datasf-opening-intel';
import type { HoustonOpeningDisplayStatus } from '@/lib/houston-opening-intel';

/** NYC priority_rank → 0–100 置信度（rank 越小越强） */
export const NYC_RANK_TO_CONFIDENCE: Readonly<Record<number, number>> = {
  1: 95,
  2: 88,
  3: 78,
  4: 68,
  5: 25,
  6: 18,
};

/** rank ≤ 此阈值视为「可能新店」（与 Pre-permit operational 复检对齐） */
export const NYC_LIKELY_NEW_MAX_RANK = 4;

export const NYC_RANK_TO_LABEL: Readonly<
  Record<number, { label: NewOpeningLabel; leadValue: 'high' | 'medium' | 'low' }>
> = {
  1: { label: 'confirmed_new_opening', leadValue: 'high' },
  2: { label: 'likely_new_opening', leadValue: 'high' },
  3: { label: 'likely_new_opening', leadValue: 'high' },
  4: { label: 'possible_new_opening', leadValue: 'medium' },
  5: { label: 'weak_signal', leadValue: 'low' },
  6: { label: 'weak_signal', leadValue: 'low' },
};

/** LA 新设施：数据集内检查行数上限（与 LA_COUNTY_NEW_FACILITY_MAX_INSPECTION_ROWS 默认一致） */
export const LA_DEFAULT_MAX_INSPECTION_ROWS = 12;

/** LA recent_inspections 策略下视为弱新店信号 */
export const LA_RECENT_INSPECTIONS_CONFIDENCE = 35;

/** LA 新设施通过筛选后的基础置信度 */
export const LA_NEW_FACILITY_BASE_CONFIDENCE = 82;

/** LA 检查行数接近上限时扣分步长 */
export const LA_INSPECTION_COUNT_PENALTY_PER_ROW = 2;

export const HOUSTON_STATUS_CONFIDENCE: Readonly<Record<HoustonOpeningDisplayStatus, number>> = {
  'pre-opening': 78,
  'opening soon': 72,
  'entity registered': 38,
  health_inspection_facility: 45,
};

/** Houston display_status 是否计为「可能新店」 */
export const HOUSTON_LIKELY_NEW_STATUSES: ReadonlySet<HoustonOpeningDisplayStatus> = new Set([
  'pre-opening',
  'opening soon',
]);
