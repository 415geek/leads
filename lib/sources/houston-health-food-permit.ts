/**
 * Houston Health Department — Food Establishment Permit
 *
 * 配置 HOUSTON_HEALTH_FOOD_PERMIT_JSON_URL（卫生局许可 / iPermits 导出 JSON）
 * 字段示例：business_name, address, permit_status (pending|approved), issue_date
 */

import type { FoodDataSource, NormalizedDraft, SourceFetchResult } from './types';
import {
  fetchJsonSupplementRows,
  pickStr,
  rowToHoustonRestaurantDraft,
} from './houston/json-supplement';

const SOURCE_ID = 'houston_health_food_permit';

export const houstonHealthFoodPermitSource: FoodDataSource = {
  id: SOURCE_ID,
  label: 'Houston Health · Food Establishment Permit（HOUSTON_HEALTH_FOOD_PERMIT_JSON_URL）',
  metro: 'houston',
  state: 'TX',
  kind: 'permit',
  portalUrl: 'https://www.houstontx.gov/health/Food-Inspections/',
  rateLimit: { rps: 1 },
  enabled: true,
  lookbackDays: 90,

  async fetchAndNormalize(opts) {
    const url = process.env.HOUSTON_HEALTH_FOOD_PERMIT_JSON_URL?.trim();
    if (!url) {
      const result: SourceFetchResult = {
        id: SOURCE_ID,
        label: houstonHealthFoodPermitSource.label,
        ok: true,
        fetched: 0,
      };
      return { result, drafts: [] as NormalizedDraft[] };
    }

    const { ok, rows, error } = await fetchJsonSupplementRows(url);
    if (!ok) {
      return {
        result: {
          id: SOURCE_ID,
          label: houstonHealthFoodPermitSource.label,
          ok: false,
          fetched: 0,
          error,
        },
        drafts: [],
      };
    }

    const drafts: NormalizedDraft[] = [];
    for (const row of rows) {
      const statusRaw = pickStr(row, ['permit_status', 'status', 'application_status']) ?? '';
      const statusLc = statusRaw.toLowerCase();
      const isPending = /pending|submitted|in review|awaiting/i.test(statusLc);
      const isApproved = /approved|active|issued|final/i.test(statusLc);

      const draft = rowToHoustonRestaurantDraft({
        sourceId: SOURCE_ID,
        row,
        since: opts.sinceDate,
        nameKeys: ['business_name', 'establishment_name', 'dba', 'name', 'facility_name'],
        ownerKeys: ['owner_name', 'owner', 'applicant'],
        addressKeys: ['address', 'site_address', 'street'],
        dateKeys: ['issue_date', 'approved_date', 'permit_date', 'application_date', 'filed_date'],
        idKeys: ['permit_number', 'permit_id', 'pe_number', 'id'],
        idPrefix: 'hfd',
        cuisineLabel: 'Houston Health · Food Permit',
        licenseType: 'Food Establishment Permit',
        houston_opening: {
          display_status: isApproved ? 'opening soon' : 'pre-opening',
          display_source: 'Food Permit',
          confidence_score: isApproved ? 'HIGH' : isPending ? 'MEDIUM' : 'LOW',
          permit_status: statusRaw || undefined,
        },
      });
      if (draft) drafts.push(draft);
    }

    return {
      result: {
        id: SOURCE_ID,
        label: houstonHealthFoodPermitSource.label,
        ok: true,
        fetched: drafts.length,
      },
      drafts,
    };
  },
};
