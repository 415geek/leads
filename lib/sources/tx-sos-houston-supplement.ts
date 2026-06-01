/**
 * Texas Secretary of State — 实体登记补充（无免费官方 API；多为采购 bulk 或手工导出）
 *
 * 配置：TX_SOS_HOUSTON_JSON_URL —— JSON 数组，元素示例：
 *   { "entity_name","filed_date","address","city","entity_type","sos_file_number","registered_agent" }
 *
 * 筛选：餐饮关键词 + 排除明显非餐饮；可选按 Harris/Houston 都会区城市过滤。
 */

import type { FoodDataSource, NormalizedDraft, SourceFetchResult } from './types';
import {
  isLikelyHoustonChainName,
  matchesHoustonNonFoodExclusion,
  matchesHoustonRestaurantKeyword,
  type HoustonOpeningIntel,
} from '@/lib/houston-opening-intel';
import { pickText, snapshotSourceRaw } from '@/lib/bay-area-food-import/shared';

const SOURCE_ID = 'tx_sos_houston_supplement';

/** 与 metro-config 休斯顿城市白名单对齐（小写匹配） */
const HOUSTON_METRO_CITIES = new Set(
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
  ].map((c) => c.toLowerCase()),
);

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

export const txSosHoustonSupplementSource: FoodDataSource = {
  id: SOURCE_ID,
  label: 'Texas SOSDirect · Business entity（TX_SOS_HOUSTON_JSON_URL 补充）',
  metro: 'houston',
  state: 'TX',
  kind: 'registration',
  portalUrl: 'https://direct.sos.state.tx.us/',
  rateLimit: { rps: 1 },
  enabled: true,
  lookbackDays: 60,

  async fetchAndNormalize(opts) {
    const url = process.env.TX_SOS_HOUSTON_JSON_URL?.trim();
    if (!url) {
      return {
        result: {
          id: SOURCE_ID,
          label: txSosHoustonSupplementSource.label,
          ok: true,
          fetched: 0,
        },
        drafts: [],
      };
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
            label: txSosHoustonSupplementSource.label,
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
          pickStr(row, ['entity_name', 'company_name', 'name', 'business_name']) ?? '';
        if (name.length < 2) continue;
        if (matchesHoustonNonFoodExclusion(name)) continue;
        const { ok: kwOk, hits } = matchesHoustonRestaurantKeyword(name);
        if (!kwOk) continue;
        if (isLikelyHoustonChainName(name)) continue;

        const cityRaw = pickStr(row, ['city']) || 'Houston';
        const cityLc = cityRaw.toLowerCase().trim();
        if (!HOUSTON_METRO_CITIES.has(cityLc) && !cityLc.includes('houston')) {
          // 宽松：县内常填 Houston；其它城市必须在白名单
          const county = pickStr(row, ['county']);
          if (!county || !/harris/i.test(county)) continue;
        }

        const address = pickStr(row, ['address', 'registered_office', 'principal_address']);
        const filed = toIsoDate(pickStr(row, ['filed_date', 'formation_date', 'registration_date']));
        if (filed && filed < since) continue;

        const fileNum = pickStr(row, ['sos_file_number', 'file_number', 'entity_id']);
        const external_id = fileNum ?? `txsos_${name.slice(0, 36)}_${(address || '').slice(0, 20)}`;

        const houston_opening: HoustonOpeningIntel = {
          display_status: 'entity registered',
          display_source: 'TX SOSDirect',
          confidence_score: 'LOW',
          keyword_hits: hits,
        };

        const entityType = pickStr(row, ['entity_type', 'type']);

        drafts.push({
          external_id,
          name,
          address,
          phone: pickStr(row, ['phone']),
          cuisine_type: `TX SOS · ${entityType || 'entity'}`,
          city: cityRaw,
          metro_area: 'houston',
          source: SOURCE_ID,
          license_date: filed,
          first_inspection_date: null,
          license_type: entityType || 'Business entity',
          source_raw: snapshotSourceRaw({ ...row, _houston_intel: houston_opening }),
          lead_status: 'new',
          houston_opening,
        });
      }

      return {
        result: {
          id: SOURCE_ID,
          label: txSosHoustonSupplementSource.label,
          ok: true,
          fetched: drafts.length,
        },
        drafts,
      };
    } catch (e) {
      return {
        result: {
          id: SOURCE_ID,
          label: txSosHoustonSupplementSource.label,
          ok: false,
          fetched: 0,
          error: e instanceof Error ? e.message : 'fetch failed',
        },
        drafts: [],
      };
    }
  },
};
