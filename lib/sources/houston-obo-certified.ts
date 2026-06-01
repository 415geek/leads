/**
 * Houston OBO — Certified Contractor / Tenant Directory
 *
 * 配置 HOUSTON_OBO_CERTIFIED_JSON_URL（Permitting Center OBO 目录导出）
 * 官方无稳定公开批量 API；JSON 由 n8n / 手工导出托管。
 */

import type { FoodDataSource, NormalizedDraft } from './types';
import {
  fetchJsonSupplementRows,
  pickStr,
  rowToHoustonRestaurantDraft,
} from './houston/json-supplement';

const SOURCE_ID = 'houston_obo_certified';
const PORTAL_URL = 'https://www.houstonpermittingcenter.org/';

export const houstonOboCertifiedSource: FoodDataSource = {
  id: SOURCE_ID,
  label: 'Houston OBO · Certified Directory（HOUSTON_OBO_CERTIFIED_JSON_URL）',
  metro: 'houston',
  state: 'TX',
  kind: 'permit',
  portalUrl: PORTAL_URL,
  rateLimit: { rps: 1 },
  enabled: true,
  lookbackDays: 180,

  async fetchAndNormalize(opts) {
    const url = process.env.HOUSTON_OBO_CERTIFIED_JSON_URL?.trim();
    if (!url) {
      return {
        result: {
          id: SOURCE_ID,
          label: houstonOboCertifiedSource.label,
          ok: true,
          fetched: 0,
        },
        drafts: [] as NormalizedDraft[],
      };
    }

    const { ok, rows, error } = await fetchJsonSupplementRows(url);
    if (!ok) {
      return {
        result: {
          id: SOURCE_ID,
          label: houstonOboCertifiedSource.label,
          ok: false,
          fetched: 0,
          error,
        },
        drafts: [],
      };
    }

    const drafts: NormalizedDraft[] = [];
    for (const row of rows) {
      const certType = pickStr(row, ['certification_type', 'type', 'category', 'trade']) ?? '';
      const isTenant =
        /tenant|occupancy|restaurant|food|commercial tenant/i.test(certType) ||
        /tenant|occupancy|restaurant|food/i.test(
          pickStr(row, ['description', 'notes', 'project_type']) ?? '',
        );

      const draft = rowToHoustonRestaurantDraft({
        sourceId: SOURCE_ID,
        row,
        since: opts.sinceDate,
        nameKeys: [
          'business_name',
          'tenant_name',
          'project_name',
          'company_name',
          'contractor_name',
          'name',
        ],
        addressKeys: ['address', 'project_address', 'site_address'],
        dateKeys: ['certified_date', 'issue_date', 'expiration_date', 'status_date'],
        idKeys: ['certificate_number', 'license_number', 'id'],
        idPrefix: 'obo',
        cuisineLabel: 'Houston OBO · Certified',
        licenseType: certType || 'OBO Certified',
        requireRestaurantKeyword: isTenant ? false : true,
        houston_opening: {
          display_status: 'pre-opening',
          display_source: 'OBO Certified Directory',
          confidence_score: 'LOW',
        },
      });
      if (draft) drafts.push(draft);
    }

    return {
      result: {
        id: SOURCE_ID,
        label: houstonOboCertifiedSource.label,
        ok: true,
        fetched: drafts.length,
      },
      drafts,
    };
  },
};
