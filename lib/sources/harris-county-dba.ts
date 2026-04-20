/**
 * Harris County Clerk — Assumed Name / DBA（最高优先级业务信号）
 *
 * 官方门户无公开批量 API；常见落地方式：
 *   - 向 County Clerk Data Sales 采购 FTP/CSV（datasales@cco.hctx.net）
 *   - n8n / 脚本抓取检索结果后托管 JSON，由本 adapter 拉取
 *
 * 配置：环境变量 HARRIS_DBA_JSON_URL —— HTTPS 可访问的 JSON 数组，元素字段示例：
 *   { "business_name","owner_name","address","city","filed_date","file_number" }
 *
 * 未配置 URL 时：返回 0 条、ok: true（不拖垮 cron）。
 */

import type { FoodDataSource, NormalizedDraft, SourceFetchResult } from './types';
import {
  isLikelyHoustonChainName,
  matchesHoustonNonFoodExclusion,
  matchesHoustonRestaurantKeyword,
  type HoustonOpeningIntel,
} from '@/lib/houston-opening-intel';
import { pickText, snapshotSourceRaw } from '@/lib/bay-area-food-import/shared';

const SOURCE_ID = 'harris_county_dba';

function pickStr(row: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = pickText(row[k]);
    if (v) return v;
  }
  return null;
}

function toIsoDate(raw: string | null): string | null {
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

export const harrisCountyDbaSource: FoodDataSource = {
  id: SOURCE_ID,
  label: 'Harris County Clerk · Assumed Name / DBA（HARRIS_DBA_JSON_URL 补充）',
  metro: 'houston',
  state: 'TX',
  kind: 'registration',
  portalUrl: 'https://www.harriscountytx.gov/Business/County-Clerk/Assumed-Names-Search',
  rateLimit: { rps: 1 },
  enabled: true,
  lookbackDays: 60,

  async fetchAndNormalize(opts) {
    const url = process.env.HARRIS_DBA_JSON_URL?.trim();
    if (!url) {
      const result: SourceFetchResult = {
        id: SOURCE_ID,
        label: harrisCountyDbaSource.label,
        ok: true,
        fetched: 0,
      };
      return { result, drafts: [] };
    }

    try {
      const res = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'RestaurantLeadsFinder/1.0 (+https://leads.maxwelllai.com)',
        },
        next: { revalidate: 0 },
      });
      if (!res.ok) {
        return {
          result: {
            id: SOURCE_ID,
            label: harrisCountyDbaSource.label,
            ok: false,
            fetched: 0,
            error: `HTTP ${res.status}`,
          },
          drafts: [],
        };
      }
      const json = (await res.json()) as unknown;
      const rows = Array.isArray(json) ? json : [];
      const since = opts.sinceDate;
      const drafts: NormalizedDraft[] = [];

      for (const item of rows) {
        if (!item || typeof item !== 'object') continue;
        const row = item as Record<string, unknown>;
        const name =
          pickStr(row, ['business_name', 'business', 'dba', 'assumed_name', 'name']) ?? '';
        if (name.length < 2) continue;

        if (matchesHoustonNonFoodExclusion(name)) continue;
        const { ok: kwOk, hits } = matchesHoustonRestaurantKeyword(name);
        if (!kwOk) continue;
        if (isLikelyHoustonChainName(name)) continue;

        const owner = pickStr(row, ['owner_name', 'owner', 'registrant']);
        const address = pickStr(row, ['address', 'business_address', 'street']);
        const city = pickStr(row, ['city']) || 'Houston';
        const filed = toIsoDate(pickStr(row, ['filed_date', 'filing_date', 'date', 'recorded']));
        if (filed && filed < since) continue;

        const fileNum = pickStr(row, ['file_number', 'file_no', 'film_code', 'id']);
        const external_id = fileNum ?? `hdba_${name.slice(0, 40)}_${(address || '').slice(0, 24)}`;

        const houston_opening: HoustonOpeningIntel = {
          display_status: 'pre-opening',
          display_source: 'DBA Filing',
          confidence_score: 'MEDIUM',
          keyword_hits: hits,
        };

        const source_raw = snapshotSourceRaw({
          ...row,
          _houston_intel: houston_opening,
          owner_name: owner,
        });

        drafts.push({
          external_id,
          name,
          address,
          phone: pickStr(row, ['phone']),
          cuisine_type: 'DBA · Harris County',
          city,
          metro_area: 'houston',
          source: SOURCE_ID,
          license_date: filed,
          first_inspection_date: null,
          license_type: 'Assumed Name / DBA',
          source_raw,
          lead_status: 'new',
          houston_opening,
        });
      }

      return {
        result: {
          id: SOURCE_ID,
          label: harrisCountyDbaSource.label,
          ok: true,
          fetched: drafts.length,
        },
        drafts,
      };
    } catch (e) {
      return {
        result: {
          id: SOURCE_ID,
          label: harrisCountyDbaSource.label,
          ok: false,
          fetched: 0,
          error: e instanceof Error ? e.message : 'fetch failed',
        },
        drafts: [],
      };
    }
  },
};
