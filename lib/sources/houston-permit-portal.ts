/**
 * Houston Permitting Center — Building Permits / Certificate of Occupancy
 *
 * 优先级 #1：HOUSTON_PERMIT_PORTAL_JSON_URL（iPermits / OBO 导出或 n8n 托管 JSON）
 * 回退：规划局 Weekly Permit eReport XLSX（dev_reports-archives）
 */

import { fetchHoustonPermitEreportLeads } from '@/lib/houston-dev-reports/permit-ereport';
import { pickText } from '@/lib/bay-area-food-import/shared';
import { inferOpeningSignalFromPermitDate } from '@/lib/pipeline/infer-opening-signals';
import type { FoodDataSource, NormalizedDraft, SourceFetchResult } from './types';
import {
  fetchJsonSupplementRows,
  pickStr,
  rowToHoustonRestaurantDraft,
} from './houston/json-supplement';

const SOURCE_ID = 'houston_permit_portal';
const PORTAL_URL = 'https://www.houstonpermittingcenter.org/';

function draftsFromPortalJson(rows: Record<string, unknown>[], since: string): NormalizedDraft[] {
  const drafts: NormalizedDraft[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const permitKind = pickStr(row, [
      'permit_type',
      'type',
      'record_type',
      'permit_category',
      'document_type',
    ]);
    const isCo = /certificate of occupancy|\bco\b|occupancy|change of use/i.test(
      `${permitKind || ''} ${pickStr(row, ['comments', 'description', 'notes']) || ''}`,
    );

    const draft = rowToHoustonRestaurantDraft({
      sourceId: SOURCE_ID,
      row,
      since,
      nameKeys: ['business_name', 'project_name', 'trade_name', 'dba', 'name', 'tenant_name'],
      addressKeys: ['address', 'site_address', 'street', 'location'],
      cityKeys: ['city'],
      dateKeys: [
        'permit_date',
        'issue_date',
        'co_date',
        'certificate_date',
        'approved_date',
        'status_date',
      ],
      idKeys: ['permit_number', 'project_no', 'project_number', 'permit_id', 'co_number'],
      idPrefix: 'hpc',
      cuisineLabel: isCo ? 'Houston Permit · CO' : 'Houston Permit · Building',
      licenseType: isCo ? 'Certificate of Occupancy' : permitKind || 'Building Permit',
      requireRestaurantKeyword: false,
      houston_opening: {
        display_status: isCo ? 'opening soon' : 'pre-opening',
        display_source: isCo ? 'Certificate of Occupancy' : 'Building Permit',
        confidence_score: isCo ? 'HIGH' : 'MEDIUM',
        permit_status: pickStr(row, ['status', 'permit_status']) ?? undefined,
      },
    });
    if (!draft) continue;
    const key = `${draft.external_id}|${draft.address || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    drafts.push({
      ...draft,
      opening_signals: inferOpeningSignalFromPermitDate(draft.license_date) ?? undefined,
    });
  }
  return drafts;
}

export const houstonPermitPortalSource: FoodDataSource = {
  id: SOURCE_ID,
  label: 'Houston Permitting Center · Building Permits / CO（JSON + eReport 回退）',
  metro: 'houston',
  state: 'TX',
  kind: 'permit',
  portalUrl: PORTAL_URL,
  rateLimit: { rps: 0.25 },
  enabled: true,
  lookbackDays: 365,

  async fetchAndNormalize(opts) {
    const drafts: NormalizedDraft[] = [];
    const seen = new Set<string>();
    let warning: string | undefined;

    const jsonUrl = process.env.HOUSTON_PERMIT_PORTAL_JSON_URL?.trim();
    if (jsonUrl) {
      const { ok, rows, error } = await fetchJsonSupplementRows(jsonUrl);
      if (!ok) {
        return {
          result: {
            id: SOURCE_ID,
            label: houstonPermitPortalSource.label,
            ok: false,
            fetched: 0,
            error,
          },
          drafts: [],
        };
      }
      for (const d of draftsFromPortalJson(rows, opts.sinceDate)) {
        const key = `${d.external_id}|${d.address || ''}`;
        seen.add(key);
        drafts.push(d);
      }
    }

    const { result: erResult, leads } = await fetchHoustonPermitEreportLeads({
      sinceDate: opts.sinceDate,
    });
    if (!erResult.ok && drafts.length === 0) {
      return {
        result: {
          id: SOURCE_ID,
          label: houstonPermitPortalSource.label,
          ok: false,
          fetched: 0,
          error: erResult.error,
        },
        drafts: [],
      };
    }
    if (!erResult.ok) warning = erResult.error;

    for (const l of leads) {
      const raw = l.source_raw as Record<string, unknown>;
      const projectNo = pickText(raw['Project No']) ?? String(raw['Project No'] ?? '').trim();
      const external_id = projectNo.length ? projectNo : null;
      const key = `${external_id || l.name}|${l.address || ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      drafts.push({
        external_id,
        name: l.name,
        address: l.address,
        phone: l.phone,
        cuisine_type: l.cuisine_type,
        city: l.city,
        metro_area: 'houston',
        source: SOURCE_ID,
        license_date: l.license_date,
        first_inspection_date: null,
        license_type: l.license_type,
        source_raw: { ...l.source_raw, _ereport_fallback: true },
        lead_status: 'new',
        opening_signals: inferOpeningSignalFromPermitDate(l.license_date) ?? undefined,
        houston_opening: {
          display_status: 'pre-opening',
          display_source: 'Planning eReport',
          confidence_score: 'MEDIUM',
        },
      });
    }

    const result: SourceFetchResult = {
      id: SOURCE_ID,
      label: houstonPermitPortalSource.label,
      ok: true,
      fetched: drafts.length,
      warning,
    };
    return { result, drafts };
  },
};
