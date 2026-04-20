/**
 * Houston Planning — archived weekly Permit Web eReport (Excel)
 *
 * Portal: https://www.houstontx.gov/planning/DevelopRegs/dev_reports-archives.html
 * kind: permit —— license_date = permit issue date from workbook
 */

import {
  fetchHoustonPermitEreportLeads,
  HOUSTON_DEV_REPORTS_ARCHIVE_URL,
} from '@/lib/houston-dev-reports/permit-ereport';
import { pickText } from '@/lib/bay-area-food-import/shared';
import type { FoodDataSource, NormalizedDraft } from './types';

export const houstonPermitEreportSource: FoodDataSource = {
  id: 'houston_permit_ereport',
  label:
    'Houston Planning · Weekly Permit Web eReport（dev_reports-archives .xlsx）',
  metro: 'houston',
  state: 'TX',
  kind: 'permit',
  portalUrl: HOUSTON_DEV_REPORTS_ARCHIVE_URL,
  rateLimit: { rps: 0.25 },
  enabled: true,
  /** Weekly files + holiday gaps：略长于默认 30 天窗口 */
  lookbackDays: 45,

  async fetchAndNormalize(opts) {
    const { result, leads } = await fetchHoustonPermitEreportLeads({
      sinceDate: opts.sinceDate,
    });

    const drafts: NormalizedDraft[] = leads.map((l) => {
      const raw = l.source_raw as Record<string, unknown>;
      const projectNo = pickText(raw['Project No']) ?? String(raw['Project No'] ?? '').trim();
      return {
        external_id: projectNo.length ? projectNo : null,
        name: l.name,
        address: l.address,
        phone: l.phone,
        cuisine_type: l.cuisine_type,
        city: l.city,
        metro_area: 'houston',
        source: l.source,
        license_date: l.license_date,
        first_inspection_date: null,
        license_type: l.license_type,
        source_raw: l.source_raw,
        lead_status: 'new',
      };
    });

    return { result, drafts };
  },
};
