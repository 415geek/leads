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
import { inferOpeningSignalFromPermitDate } from '@/lib/pipeline/infer-opening-signals';
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
  /** 已并入 houston_permit_portal（eReport 回退）；保留 id 兼容历史数据 */
  enabled: false,
  /**
   * Houston Planning 的 archive 自 2025-12-01 之后没有再发布新的 weekly xlsx
   * （核查日期 2026-05-26）。为了把 2025 后半年遗留的有效数据拉进系统，
   * 这里临时把窗口放到 365 天；待找到替代数据源后可下调回 45。
   */
  lookbackDays: 365,

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
        opening_signals: inferOpeningSignalFromPermitDate(l.license_date) ?? undefined,
      };
    });

    return { result, drafts };
  },
};
