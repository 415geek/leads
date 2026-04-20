/**
 * 休斯顿都会区：跨政府源合并（地址键 + 名称相似度）。
 * 在 dedupePipelineLeads 之后调用；优先保留食品许可/规划局许可，其次 HDHHS，再次 DBA，最后 TX SOS。
 */

import type { PipelineLead } from './run';
import {
  diceCoefficientSimilarity,
  HOUSTON_NAME_MERGE_MIN_SIMILARITY,
  houstonMergePriority,
  normalizeHoustonAddressKey,
} from '@/lib/houston-opening-intel';

function mergeTwoHoustonLeads(winner: PipelineLead, loser: PipelineLead): PipelineLead {
  const wCls = (winner.ai_classification ?? {}) as Record<string, unknown>;
  const mergedSources = Array.isArray(wCls.merged_sources)
    ? ([...new Set([...(wCls.merged_sources as string[]), loser.source])] as string[])
    : [loser.source];

  const mergedSnapshots = Array.isArray(wCls.merged_snapshots)
    ? [...(wCls.merged_snapshots as Record<string, unknown>[]), { source: loser.source, source_raw: loser.source_raw }]
    : [{ source: loser.source, source_raw: loser.source_raw }];

  const nextCls: Record<string, unknown> = {
    ...wCls,
    merged_sources: mergedSources,
    merged_snapshots: mergedSnapshots,
    houston_cross_source_merge: true,
  };

  return {
    ...winner,
    ai_classification: nextCls,
    // 若胜者无电话而败者有，可补上
    phone: winner.phone || loser.phone,
    license_date: winner.license_date || loser.license_date,
    first_inspection_date: winner.first_inspection_date || loser.first_inspection_date,
  };
}

/**
 * 仅处理 metro_area === 'houston' 的条目；其它原样返回。
 */
export function mergeHoustonCrossSourceLeads(leads: readonly PipelineLead[]): PipelineLead[] {
  const nonHouston: PipelineLead[] = [];
  const houston: PipelineLead[] = [];
  for (const l of leads) {
    if (l.metro_area === 'houston') houston.push(l);
    else nonHouston.push(l);
  }
  if (houston.length <= 1) return [...nonHouston, ...houston];

  const byAddr = new Map<string, PipelineLead[]>();
  const noAddr: PipelineLead[] = [];
  for (const l of houston) {
    const key = normalizeHoustonAddressKey(l.address, l.city);
    if (!key) {
      noAddr.push(l);
      continue;
    }
    const g = byAddr.get(key);
    if (g) g.push(l);
    else byAddr.set(key, [l]);
  }

  const merged: PipelineLead[] = [...noAddr];
  for (const group of byAddr.values()) {
    if (group.length === 1) {
      merged.push(group[0]);
      continue;
    }
    const sorted = [...group].sort((a, b) => houstonMergePriority(b.source) - houstonMergePriority(a.source));
    let accum = sorted[0];
    const leftovers: PipelineLead[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const o = sorted[i];
      if (diceCoefficientSimilarity(accum.name, o.name) >= HOUSTON_NAME_MERGE_MIN_SIMILARITY) {
        accum = mergeTwoHoustonLeads(accum, o);
      } else {
        leftovers.push(o);
      }
    }
    merged.push(accum, ...leftovers);
  }

  return [...nonHouston, ...merged];
}
