/**
 * 内存去重：同 (source, external_id) 或 同 (name, address, city) 的重复条目合并
 *
 * 供 /api/leads/import 和 /api/leads/upsert 在批量 upsert 前清理用。
 * 数据库层有 idx_leads_source_external / idx_leads_name_address_city_lower 双索引兜底，
 * 但减少往返调用和避免 onConflict 与部分索引的互相干扰仍是必要的。
 */

import type { PipelineLead } from './run';

export interface DedupeKeyable {
  source: string;
  external_id: string | null;
  name: string;
  address: string | null;
  city: string;
}

function dedupeKey(r: DedupeKeyable): string {
  if (r.external_id) return `${r.source}::${r.external_id}`;
  return `${(r.name || '').toLowerCase()}::${(r.address || '').toLowerCase()}::${(r.city || '').toLowerCase()}`;
}

export function dedupePipelineLeads(leads: readonly PipelineLead[]): PipelineLead[] {
  const seen = new Map<string, PipelineLead>();
  for (const l of leads) {
    const k = dedupeKey(l);
    if (!seen.has(k)) seen.set(k, l);
  }
  return Array.from(seen.values());
}

export function dedupeRows<T extends DedupeKeyable>(rows: readonly T[]): T[] {
  const seen = new Map<string, T>();
  for (const r of rows) {
    const k = dedupeKey(r);
    if (!seen.has(k)) seen.set(k, r);
  }
  return Array.from(seen.values());
}
