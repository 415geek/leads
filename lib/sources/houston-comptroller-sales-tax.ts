/**
 * Texas Comptroller — Sales Tax Permit（Harris / Houston metro）
 *
 * Live: data.texas.gov Socrata 3kx8-uryv（All Permitted Sales Tax Locations）
 * 回退：TX_COMPTROLLER_HOUSTON_JSON_URL
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

const SOURCE_ID = 'houston_comptroller_sales_tax';
const COMPTROLLER_ENDPOINT = 'https://data.texas.gov/resource/3kx8-uryv.json';
const FETCH_LIMIT = 500;

/** NAICS 722* = 餐饮相关 */
const FOOD_NAICS_PREFIX = '722';

function normalizeComptrollerRow(row: Record<string, unknown>, since: string): NormalizedDraft | null {
  const locName = pickText(row.loc_name) ?? pickText(row.tp_name) ?? '';
  const name = locName.trim();
  if (name.length < 2) return null;

  const city = pickText(row.loc_city) ?? 'Houston';
  const county = pickText(row.loc_county) ?? pickText(row.tp_county);
  if (!isHoustonMetroCity(city, county)) return null;

  const oob = pickText(row.out_of_business_date);
  if (oob) return null;

  const naics = pickText(row.naics) ?? '';
  const { ok: kwOk, hits } = matchesHoustonRestaurantKeyword(name);
  const naicsOk = naics.startsWith(FOOD_NAICS_PREFIX);
  if (!kwOk && !naicsOk) return null;
  if (isLikelyHoustonChainName(name)) return null;

  const permitDate =
    toIsoDate(pickText(row.permit_date)) ?? toIsoDate(pickText(row.first_sale_date));
  if (permitDate && permitDate < since) return null;

  const addrNum = pickText(row.address_number);
  const addrText = pickText(row.address_text);
  const address = [addrNum, addrText].filter(Boolean).join(' ').trim() || null;

  const tpNum = pickText(row.tp_number);
  const locNum = pickText(row.loc_number);
  const external_id = tpNum && locNum ? `txc_${tpNum}_${locNum}` : null;

  const houston_opening: HoustonOpeningIntel = {
    display_status: 'pre-opening',
    display_source: 'Sales Tax Permit',
    confidence_score: naicsOk ? 'MEDIUM' : 'LOW',
    keyword_hits: kwOk ? hits : undefined,
  };

  return {
    external_id,
    name,
    address,
    phone: null,
    cuisine_type: `TX Comptroller · Sales Tax${naics ? ` · NAICS ${naics}` : ''}`,
    city,
    metro_area: 'houston',
    source: SOURCE_ID,
    license_date: permitDate,
    first_inspection_date: null,
    license_type: 'Sales Tax Permit',
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
      nameKeys: ['dba', 'taxpayer_name', 'business_name', 'trade_name', 'name', 'loc_name'],
      ownerKeys: ['owner_name', 'taxpayer_name', 'tp_name'],
      addressKeys: ['address', 'outlet_address', 'street', 'location'],
      cityKeys: ['city', 'outlet_city', 'loc_city'],
      dateKeys: ['permit_date', 'effective_date', 'start_date', 'filed_date', 'issue_date'],
      idKeys: ['outlet_number', 'permit_number', 'taxpayer_number', 'id'],
      idPrefix: 'txcj',
      cuisineLabel: 'TX Comptroller · Sales Tax',
      licenseType: 'Sales Tax Permit',
      houston_opening: {
        display_status: 'pre-opening',
        display_source: 'Sales Tax Permit',
        confidence_score: 'LOW',
      },
    });
    if (draft) drafts.push(draft);
  }
  return drafts;
}

export const houstonComptrollerSalesTaxSource: FoodDataSource = {
  id: SOURCE_ID,
  label:
    'Texas Comptroller · Sales Tax Permit（data.texas.gov + TX_COMPTROLLER_HOUSTON_JSON_URL 回退）',
  metro: 'houston',
  state: 'TX',
  kind: 'registration',
  portalUrl: 'https://data.texas.gov/Government-and-Taxes/All-Permitted-Sales-Tax-Locations-and-Local-Sales-/3kx8-uryv',
  rateLimit: { rps: 1 },
  enabled: true,
  lookbackDays: 90,

  async fetchAndNormalize(opts) {
    const sinceIso = `${opts.sinceDate}T00:00:00.000`;
    const where = `loc_city='HOUSTON' AND permit_date >= '${sinceIso}' AND (out_of_business_date IS NULL OR out_of_business_date = '')`;

    const res = await fetchSocrata({
      endpoint: COMPTROLLER_ENDPOINT,
      where,
      limit: FETCH_LIMIT,
      order: 'permit_date DESC',
    });

    const drafts: NormalizedDraft[] = [];
    if (res.ok) {
      for (const row of res.rows) {
        const draft = normalizeComptrollerRow(row, opts.sinceDate);
        if (draft) drafts.push(draft);
      }
    }

    if (drafts.length === 0 || !res.ok) {
      const jsonUrl = process.env.TX_COMPTROLLER_HOUSTON_JSON_URL?.trim();
      if (jsonUrl) {
        const { ok, rows, error } = await fetchJsonSupplementRows(jsonUrl);
        if (!ok) {
          return {
            result: {
              id: SOURCE_ID,
              label: houstonComptrollerSalesTaxSource.label,
              ok: false,
              fetched: 0,
              error: error ?? res.error,
            },
            drafts: [],
          };
        }
        const jsonDrafts = draftsFromJson(rows, opts.sinceDate);
        return {
          result: {
            id: SOURCE_ID,
            label: houstonComptrollerSalesTaxSource.label,
            ok: true,
            fetched: jsonDrafts.length,
            warning: res.ok ? undefined : res.error,
          },
          drafts: jsonDrafts,
        };
      }
    }

    return {
      result: toSourceFetchResult(SOURCE_ID, houstonComptrollerSalesTaxSource.label, res, drafts.length),
      drafts,
    };
  },
};
