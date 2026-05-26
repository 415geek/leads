/**
 * Normalize 层 —— 对 NormalizedDraft 再做一次轻量规整 + 去重键兜底
 *
 * adapter 应已经在 fetchAndNormalize 里输出了 NormalizedDraft；
 * 本层只做与 schema 去重约束相关的最后一步 trim/lower，不改业务字段。
 */

import { allKnownMetroCities, resolveLeadCity } from '@/lib/lead-city';
import type { NormalizedDraft } from '@/lib/sources/types';

const METRO_CITY_HINTS = allKnownMetroCities();

function normText(s: string | null | undefined): string | null {
  if (s == null) return null;
  const t = String(s).trim().replace(/\s+/g, ' ');
  return t.length ? t : null;
}

export function normalizeDraft(d: NormalizedDraft): NormalizedDraft {
  const address = normText(d.address);
  const cityRaw = normText(d.city) ?? d.city;
  const city =
    resolveLeadCity(cityRaw, address, METRO_CITY_HINTS) ?? cityRaw ?? d.city;

  return {
    ...d,
    name: normText(d.name) ?? d.name,
    address,
    phone: normText(d.phone),
    city,
    external_id: normText(d.external_id),
  };
}

/** 同 (source, external_id) 或同 (name, address, city) 的 draft 合并去重 */
export function dedupeDrafts(drafts: readonly NormalizedDraft[]): NormalizedDraft[] {
  const seen = new Map<string, NormalizedDraft>();
  for (const raw of drafts) {
    const d = normalizeDraft(raw);
    const key = d.external_id
      ? `${d.source}::${d.external_id}`
      : `${(d.name || '').toLowerCase()}::${(d.address || '').toLowerCase()}::${(d.city || '').toLowerCase()}`;
    if (!seen.has(key)) {
      seen.set(key, d);
    }
  }
  return Array.from(seen.values());
}
