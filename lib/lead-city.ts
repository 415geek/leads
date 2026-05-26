/**
 * 从线索地址解析城市名，并与 metro 白名单对齐（用于筛选下拉与入库补全）。
 */

import { METRO_CONFIGS } from '@/lib/sources/metro-config';
import type { LeadRegionFilterId } from '@/lib/region-config';

const US_STATE_ABBR = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN',
  'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV',
  'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN',
  'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
]);

function titleCaseCity(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((w) => (w.length <= 2 && /^[A-Z]+$/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ');
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 全部启用 metro 的城市白名单（用于地址内最长匹配） */
export function allKnownMetroCities(): string[] {
  return Array.from(new Set(METRO_CONFIGS.flatMap((m) => m.cities)));
}

export function knownCitiesForRegion(region: LeadRegionFilterId): string[] {
  if (region === 'all') return allKnownMetroCities();
  const cfg = METRO_CONFIGS.find((m) => m.id === region);
  return cfg ? [...cfg.cities] : allKnownMetroCities();
}

/**
 * 从 US 风格地址字符串中提取城市名。
 * 优先在 knownCities 中做最长子串匹配，再回退到逗号/州缩写启发式。
 */
export function extractCityFromAddress(
  address: string,
  knownCities: readonly string[] = allKnownMetroCities(),
): string | null {
  const trimmed = address.trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();
  const sorted = [...knownCities].sort((a, b) => b.length - a.length);
  for (const city of sorted) {
    const cl = city.toLowerCase();
    const re = new RegExp(`(?:,|\\s)${escapeRegExp(cl)}(?:,|\\s|$)`, 'i');
    if (re.test(trimmed) || lower.endsWith(`, ${cl}`) || lower.endsWith(` ${cl}`)) {
      return city;
    }
  }

  const parts = trimmed.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const last = parts[parts.length - 1];
    const stateOnly = last.match(/^([A-Z]{2})$/i);
    const stateZip = last.match(/^([A-Z]{2})\s+(\d{5}(?:-\d{4})?)?$/i);
    if ((stateOnly || stateZip) && parts.length >= 2) {
      const candidate = parts[parts.length - 2];
      if (candidate && !US_STATE_ABBR.has(candidate.toUpperCase()) && !/^\d/.test(candidate)) {
        return titleCaseCity(candidate);
      }
    }
    const cityStateZip = last.match(/^(.+?)\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)?$/i);
    if (cityStateZip && US_STATE_ABBR.has(cityStateZip[2].toUpperCase())) {
      const candidate = cityStateZip[1].trim();
      if (candidate && !/^\d/.test(candidate)) return titleCaseCity(candidate);
    }
    if (parts.length >= 3) {
      const candidate = parts[parts.length - 2];
      if (candidate && !US_STATE_ABBR.has(candidate.toUpperCase())) {
        return titleCaseCity(candidate);
      }
    }
  }

  const commaMatch = trimmed.match(/,\s*([^,]+?),\s*([A-Z]{2})\s+\d{5}/i);
  if (commaMatch && US_STATE_ABBR.has(commaMatch[2].toUpperCase())) {
    return titleCaseCity(commaMatch[1]);
  }

  return null;
}

/** 优先用 city 列；为空时从 address 解析 */
export function resolveLeadCity(
  city: string | null | undefined,
  address: string | null | undefined,
  knownCities: readonly string[] = allKnownMetroCities(),
): string | null {
  const c = city?.trim();
  if (c && c.length >= 2) return c;
  if (!address?.trim()) return null;
  return extractCityFromAddress(address, knownCities);
}

export type LeadCityRow = { city: string | null; address: string | null };

/** 从一批 lead 行聚合去重城市（含地址解析） */
export function collectCitiesFromLeadRows(
  rows: LeadCityRow[],
  region: LeadRegionFilterId,
): string[] {
  const hints = knownCitiesForRegion(region);
  const set = new Set<string>();
  for (const row of rows) {
    const resolved = resolveLeadCity(row.city, row.address, hints);
    if (resolved) set.add(resolved);
  }
  for (const h of hints) set.add(h);
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'en'));
}

/** API 过滤用：PostgREST .or() 片段（city 精确 + address 模糊） */
export function cityFilterOrClause(city: string): string {
  const escaped = city.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
  const pattern = `%${escaped}%`;
  return `city.ilike.${pattern},address.ilike.${pattern}`;
}
