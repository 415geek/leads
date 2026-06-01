/**
 * 休斯顿 JSON 补充源共享工具（County DBA / SOS / Comptroller / OBO / Health / Permit Portal）
 */

import type { HoustonOpeningIntel } from '@/lib/houston-opening-intel';
import {
  isLikelyHoustonChainName,
  matchesHoustonNonFoodExclusion,
  matchesHoustonRestaurantKeyword,
} from '@/lib/houston-opening-intel';
import { pickText, snapshotSourceRaw } from '@/lib/bay-area-food-import/shared';
import {
  isHoustonPermitWorkDescription,
  resolveHoustonPermitLeadName,
} from '@/lib/houston-permit-naming';
import type { MetroArea, NormalizedDraft } from '../types';

export function pickStr(row: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = pickText(row[k]);
    if (v) return v;
  }
  return null;
}

export function toIsoDate(raw: string | null): string | null {
  if (!raw) return null;
  const day = raw.trim().split(/[T ]/)[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) return day;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw.trim());
  if (us) {
    const mm = us[1].padStart(2, '0');
    const dd = us[2].padStart(2, '0');
    return `${us[3]}-${mm}-${dd}`;
  }
  return null;
}

export async function fetchJsonSupplementRows(
  url: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<{ ok: boolean; rows: Record<string, unknown>[]; error?: string }> {
  try {
    const res = await fetchImpl(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'RestaurantLeadsFinder/1.0 (+https://leads.maxwelllai.com)',
      },
      cache: 'no-store',
    });
    if (!res.ok) {
      return { ok: false, rows: [], error: `HTTP ${res.status}` };
    }
    const json = (await res.json()) as unknown;
    const rows = Array.isArray(json)
      ? json.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
      : [];
    return { ok: true, rows };
  } catch (e) {
    return {
      ok: false,
      rows: [],
      error: e instanceof Error ? e.message : 'fetch failed',
    };
  }
}

export interface HoustonJsonDraftOptions {
  sourceId: string;
  row: Record<string, unknown>;
  since: string;
  nameKeys: string[];
  ownerKeys?: string[];
  addressKeys?: string[];
  cityKeys?: string[];
  dateKeys: string[];
  idKeys?: string[];
  idPrefix: string;
  cuisineLabel: string;
  licenseType: string;
  houston_opening: HoustonOpeningIntel;
  /** false = 仍入库但不过滤餐饮关键词（如地址级 permit） */
  requireRestaurantKeyword?: boolean;
  defaultCity?: string;
  phoneKeys?: string[];
}

export function rowToHoustonRestaurantDraft(opts: HoustonJsonDraftOptions): NormalizedDraft | null {
  const rawName = pickStr(opts.row, opts.nameKeys) ?? '';
  const address = pickStr(opts.row, opts.addressKeys ?? ['address', 'street', 'location']);
  const comments = pickStr(opts.row, [
    'comments',
    'description',
    'notes',
    'work_description',
    'scope',
  ]);
  const fileNum = opts.idKeys ? pickStr(opts.row, opts.idKeys) : null;

  const name = resolveHoustonPermitLeadName({
    candidateName: rawName,
    comments,
    address,
    projectNo: fileNum,
  });

  if (name.length < 2) return null;
  if (isHoustonPermitWorkDescription(rawName) && !address) return null;

  if (opts.requireRestaurantKeyword !== false) {
    if (matchesHoustonNonFoodExclusion(name)) return null;
    const probeText = [rawName, comments, name].filter(Boolean).join(' ');
    const { ok: kwOk, hits } = matchesHoustonRestaurantKeyword(probeText);
    if (!kwOk) return null;
    if (isLikelyHoustonChainName(name)) return null;
    opts.houston_opening = { ...opts.houston_opening, keyword_hits: hits };
  } else if (isLikelyHoustonChainName(name)) {
    return null;
  } else {
    const foodProbe = [
      comments,
      rawName,
      pickStr(opts.row, ['permit_type', 'type', 'record_type', 'description']),
    ]
      .filter(Boolean)
      .join(' ');
    const { ok: foodOk } = matchesHoustonRestaurantKeyword(foodProbe);
    if (!foodOk) return null;
  }

  const owner = opts.ownerKeys ? pickStr(opts.row, opts.ownerKeys) : null;
  const city = pickStr(opts.row, opts.cityKeys ?? ['city']) || opts.defaultCity || 'Houston';
  const filed = toIsoDate(pickStr(opts.row, opts.dateKeys));
  if (filed && filed < opts.since) return null;

  const external_id =
    fileNum ?? `${opts.idPrefix}_${name.slice(0, 40)}_${(address || '').slice(0, 24)}`;

  return {
    external_id,
    name,
    address,
    phone: opts.phoneKeys ? pickStr(opts.row, opts.phoneKeys) : null,
    cuisine_type: opts.cuisineLabel,
    city,
    metro_area: 'houston' as MetroArea,
    source: opts.sourceId,
    license_date: filed,
    first_inspection_date: null,
    license_type: opts.licenseType,
    source_raw: snapshotSourceRaw({ ...opts.row, _houston_intel: opts.houston_opening, owner_name: owner }),
    lead_status: 'new',
    houston_opening: opts.houston_opening,
  };
}

/** 休斯顿都会区城市白名单（与 tx-sos-houston-supplement 对齐） */
export const HOUSTON_METRO_CITIES = new Set(
  [
    'houston',
    'pasadena',
    'pearland',
    'sugar land',
    'sugarland',
    'missouri city',
    'bellaire',
    'west university place',
    'stafford',
    'galena park',
    'jacinto city',
    'deer park',
    'baytown',
    'humble',
    'spring',
    'cypress',
    'katy',
    'tomball',
    'the woodlands',
    'conroe',
    'richmond',
    'rosenberg',
    'fresno',
    'alief',
    'seabrook',
    'friendswood',
    'league city',
  ].map((c) => c.toLowerCase()),
);

export function isHoustonMetroCity(city: string | null, county: string | null): boolean {
  const cityLc = (city || '').toLowerCase().trim();
  if (HOUSTON_METRO_CITIES.has(cityLc) || cityLc.includes('houston')) return true;
  return !!(county && /harris/i.test(county));
}
