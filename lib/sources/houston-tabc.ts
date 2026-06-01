/**
 * Texas Alcoholic Beverage Commission — Harris / Houston metro licenses
 *
 * Live: data.texas.gov Socrata dataset 7hf9-qc9f (Active / Pending)
 * 回退：HOUSTON_TABC_JSON_URL
 */

import type { FoodDataSource, NormalizedDraft } from './types';
import { fetchSocrata, toSourceFetchResult } from './socrata';
import { pickText, snapshotSourceRaw } from '@/lib/bay-area-food-import/shared';
import {
  isLikelyHoustonChainName,
  matchesHoustonRestaurantKeyword,
  type HoustonOpeningIntel,
} from '@/lib/houston-opening-intel';
import {
  fetchJsonSupplementRows,
  isHoustonMetroCity,
  pickStr,
  rowToHoustonRestaurantDraft,
  toIsoDate,
} from './houston/json-supplement';

const SOURCE_ID = 'houston_tabc';
const TABC_ENDPOINT = 'https://data.texas.gov/resource/7hf9-qc9f.json';
const FETCH_LIMIT = 500;

/** 餐饮相关 TABC 许可类型（含酒吧/餐厅混合饮料等） */
const RESTAURANT_LICENSE_TYPES = new Set([
  'MB',
  'BG',
  'BE',
  'BF',
  'Q',
  'NT',
  'DS',
  'LF',
  'NB',
  'NE',
  'N',
  'W',
]);

function normalizeTabcRow(row: Record<string, unknown>, since: string): NormalizedDraft | null {
  const trade = pickText(row.trade_name) ?? pickText(row.owner) ?? '';
  const name = trade.trim();
  if (name.length < 2) return null;

  const city = pickText(row.city) ?? 'Houston';
  const county = pickText(row.county);
  if (!isHoustonMetroCity(city, county)) return null;

  const licenseType = pickText(row.license_type) ?? '';
  const { ok: kwOk, hits } = matchesHoustonRestaurantKeyword(name);
  const typeOk = RESTAURANT_LICENSE_TYPES.has(licenseType.toUpperCase());
  if (!kwOk && !typeOk) return null;
  if (isLikelyHoustonChainName(name)) return null;

  const status = pickText(row.license_status) ?? pickText(row.primary_status) ?? '';
  if (!/active|pending/i.test(status)) return null;

  const issued =
    toIsoDate(pickText(row.current_issued_date)) ??
    toIsoDate(pickText(row.status_change_date)) ??
    toIsoDate(pickText(row.original_issue_date));
  if (issued && issued < since) return null;

  const licenseId = pickText(row.license_id) ?? pickText(row.master_file_id);
  const external_id = licenseId ? `tabc_${licenseId.replace(/\D/g, '')}` : null;

  const addrParts = [pickText(row.address), pickText(row.address_2)].filter(Boolean);
  const address = addrParts.length ? addrParts.join(', ') : null;

  const houston_opening: HoustonOpeningIntel = {
    display_status: /pending/i.test(status) ? 'pre-opening' : 'opening soon',
    display_source: 'TABC License',
    confidence_score: /pending/i.test(status) ? 'MEDIUM' : 'HIGH',
    permit_status: status,
    keyword_hits: kwOk ? hits : undefined,
  };

  return {
    external_id,
    name,
    address,
    phone: null,
    cuisine_type: `TABC · ${licenseType || 'license'}`,
    city,
    metro_area: 'houston',
    source: SOURCE_ID,
    license_date: issued,
    first_inspection_date: null,
    license_type: `TABC ${licenseType}`,
    source_raw: snapshotSourceRaw({ ...row, _houston_intel: houston_opening }),
    lead_status: 'new',
    houston_opening,
  };
}

function draftsFromJson(rows: Record<string, unknown>[], since: string): NormalizedDraft[] {
  const drafts: NormalizedDraft[] = [];
  for (const row of rows) {
    const draft = rowToHoustonRestaurantDraft({
      sourceId: SOURCE_ID,
      row,
      since,
      nameKeys: ['trade_name', 'business_name', 'name', 'owner'],
      addressKeys: ['address', 'street'],
      dateKeys: ['issue_date', 'current_issued_date', 'filed_date'],
      idKeys: ['license_id', 'license_number', 'id'],
      idPrefix: 'tabcj',
      cuisineLabel: 'TABC · License',
      licenseType: pickStr(row, ['license_type', 'type']) || 'TABC',
      houston_opening: {
        display_status: 'pre-opening',
        display_source: 'TABC License',
        confidence_score: 'MEDIUM',
        permit_status: pickStr(row, ['license_status', 'status']) ?? undefined,
      },
    });
    if (draft) drafts.push(draft);
  }
  return drafts;
}

export const houstonTabcSource: FoodDataSource = {
  id: SOURCE_ID,
  label: 'Texas TABC · Harris/Houston Active & Pending Licenses（data.texas.gov + JSON 回退）',
  metro: 'houston',
  state: 'TX',
  kind: 'permit',
  portalUrl: 'https://data.texas.gov/dataset/TABC-License-Information/7hf9-qc9f',
  rateLimit: { rps: 1 },
  enabled: true,
  lookbackDays: 60,

  async fetchAndNormalize(opts) {
    const sinceIso = `${opts.sinceDate}T00:00:00.000`;
    const where = `county='Harris' AND (license_status like 'Active%' OR license_status like '%Pending%') AND status_change_date >= '${sinceIso}'`;

    const res = await fetchSocrata({
      endpoint: TABC_ENDPOINT,
      where,
      limit: FETCH_LIMIT,
      order: 'status_change_date DESC',
    });

    const drafts: NormalizedDraft[] = [];
    if (res.ok) {
      for (const row of res.rows) {
        const draft = normalizeTabcRow(row, opts.sinceDate);
        if (draft) drafts.push(draft);
      }
    }

    if (drafts.length === 0) {
      const jsonUrl = process.env.HOUSTON_TABC_JSON_URL?.trim();
      if (jsonUrl) {
        const { ok, rows, error } = await fetchJsonSupplementRows(jsonUrl);
        if (!ok) {
          return {
            result: {
              id: SOURCE_ID,
              label: houstonTabcSource.label,
              ok: false,
              fetched: 0,
              error,
            },
            drafts: [],
          };
        }
        const jsonDrafts = draftsFromJson(rows, opts.sinceDate);
        return {
          result: {
            id: SOURCE_ID,
            label: houstonTabcSource.label,
            ok: true,
            fetched: jsonDrafts.length,
            warning: res.ok ? undefined : res.error,
          },
          drafts: jsonDrafts,
        };
      }
    }

    return {
      result: toSourceFetchResult(SOURCE_ID, houstonTabcSource.label, res, drafts.length),
      drafts,
    };
  },
};
