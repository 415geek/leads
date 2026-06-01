/**
 * NYC DOHMH 43nn-pn8j — inspection_type 规则层
 *
 * Pre-permit（尤其 Non-operational）≈ 新店 / 换证 / permit 流程中；
 * Cycle Inspection ≈ 常规年检，新店线索价值较低。
 */

import type { NewOpeningLabel } from '@/lib/datasf-opening-intel';
import { pickText } from '@/lib/bay-area-food-import/shared';

export type NycInspectionCategory =
  | 'pre_permit_non_operational'
  | 'pre_permit_operational'
  | 'cycle'
  | 'unknown';

export type NycInspectionPhase = 'initial' | 're_inspection' | 'unknown';

export interface NycOpeningIntel {
  inspection_type: string;
  category: NycInspectionCategory;
  phase: NycInspectionPhase;
  /** 1 = 最强新店线索，6 = 最弱 */
  priority_rank: number;
  new_opening_label: NewOpeningLabel;
  lead_value: 'high' | 'medium' | 'low';
  /** 中文展示（详情页 / 列表辅助） */
  display_status: string;
  display_source: 'NYC DOHMH Inspection';
  confidence_score: 'HIGH' | 'MEDIUM' | 'LOW';
  is_pre_permit: boolean;
}

const DISPLAY_BY_RANK: Record<
  number,
  { display_status: string; label: NewOpeningLabel; lead_value: 'high' | 'medium' | 'low'; confidence: 'HIGH' | 'MEDIUM' | 'LOW' }
> = {
  1: {
    display_status: '发证前检查（未营业）/ 初检',
    label: 'confirmed_new_opening',
    lead_value: 'high',
    confidence: 'HIGH',
  },
  2: {
    display_status: '发证前检查（未营业）/ 复检',
    label: 'likely_new_opening',
    lead_value: 'high',
    confidence: 'HIGH',
  },
  3: {
    display_status: '发证前检查（已运营）/ 初检',
    label: 'likely_new_opening',
    lead_value: 'high',
    confidence: 'MEDIUM',
  },
  4: {
    display_status: '发证前检查（已运营）/ 复检',
    label: 'possible_new_opening',
    lead_value: 'medium',
    confidence: 'MEDIUM',
  },
  5: {
    display_status: '常规周期检查 / 初检',
    label: 'weak_signal',
    lead_value: 'low',
    confidence: 'LOW',
  },
  6: {
    display_status: '常规周期检查 / 复检',
    label: 'weak_signal',
    lead_value: 'low',
    confidence: 'LOW',
  },
};

function parsePhase(text: string): NycInspectionPhase {
  const t = text.toLowerCase();
  if (t.includes('re-inspection') || t.includes('reinspection')) return 're_inspection';
  if (t.includes('initial inspection')) return 'initial';
  return 'unknown';
}

function parseCategory(text: string): NycInspectionCategory {
  const t = text.toLowerCase();
  if (t.includes('pre-permit') && t.includes('non-operational')) return 'pre_permit_non_operational';
  if (t.includes('pre-permit') && t.includes('operational')) return 'pre_permit_operational';
  if (t.includes('cycle inspection')) return 'cycle';
  return 'unknown';
}

function priorityRank(category: NycInspectionCategory, phase: NycInspectionPhase): number {
  if (category === 'pre_permit_non_operational') return phase === 're_inspection' ? 2 : 1;
  if (category === 'pre_permit_operational') return phase === 're_inspection' ? 4 : 3;
  if (category === 'cycle') return phase === 're_inspection' ? 6 : 5;
  return 99;
}

/** 解析 DOHMH inspection_type 字段（如 "Pre-permit (Non-operational) / Initial Inspection"） */
export function parseNycInspectionType(raw: string | null | undefined): NycOpeningIntel {
  const inspection_type = pickText(raw) || 'unknown';
  const category = parseCategory(inspection_type);
  const phase = parsePhase(inspection_type);
  const rank = priorityRank(category, phase);
  const meta = DISPLAY_BY_RANK[rank] ?? {
    display_status: '未知检查类型',
    label: 'weak_signal' as NewOpeningLabel,
    lead_value: 'low' as const,
    confidence: 'LOW' as const,
  };

  return {
    inspection_type,
    category,
    phase,
    priority_rank: rank,
    new_opening_label: meta.label,
    lead_value: meta.lead_value,
    display_status: meta.display_status,
    display_source: 'NYC DOHMH Inspection',
    confidence_score: meta.confidence,
    is_pre_permit: category === 'pre_permit_non_operational' || category === 'pre_permit_operational',
  };
}

export function nycIncludeCycleInspections(): boolean {
  return process.env.NYC_INCLUDE_CYCLE_INSPECTIONS === '1';
}

/** Socrata $where：默认仅 Pre-permit + 有菜系描述 */
export function buildNycInspectionWhere(sinceDate: string, includeCycle = nycIncludeCycleInspections()): string {
  const datePart = `inspection_date >= '${sinceDate}T00:00:00'`;
  const cuisinePart = `cuisine_description IS NOT NULL AND trim(cuisine_description) != ''`;
  if (includeCycle) {
    return `${datePart} AND ${cuisinePart}`;
  }
  return `${datePart} AND inspection_type like 'Pre-permit%' AND ${cuisinePart}`;
}

function inspectionDateMs(row: Record<string, unknown>): number {
  const t = pickText(row.inspection_date);
  if (!t) return 0;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

/** 同一 camis 保留 priority 最高（数字最小）的记录；同 rank 取最新 inspection_date */
export function dedupeNycRowsByCamis(rows: readonly Record<string, unknown>[]): Record<string, unknown>[] {
  const byCamis = new Map<string, Record<string, unknown>>();

  for (const row of rows) {
    const camis = pickText(row.camis);
    if (!camis) continue;

    const existing = byCamis.get(camis);
    if (!existing) {
      byCamis.set(camis, row);
      continue;
    }

    const curIntel = parseNycInspectionType(pickText(row.inspection_type));
    const exIntel = parseNycInspectionType(pickText(existing.inspection_type));

    if (curIntel.priority_rank < exIntel.priority_rank) {
      byCamis.set(camis, row);
      continue;
    }
    if (curIntel.priority_rank > exIntel.priority_rank) continue;

    if (inspectionDateMs(row) >= inspectionDateMs(existing)) {
      byCamis.set(camis, row);
    }
  }

  return [...byCamis.values()];
}
