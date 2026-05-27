import { calculateLeadScore } from '@/lib/scoring';
import type { Lead } from '@/types/lead';
import {
  buildCuisineLabel,
  pickText,
  snapshotSourceRaw,
  type FoodLeadDraft,
  type SourceFetchResult,
} from './shared';

const BERKELEY_API = 'https://data.cityofberkeley.info/resource/rwnf-bu3w.json';

// Berkeley 的 Barracuda WAF 把任何包含 SoQL `OR` / `LIKE '%...%'` 的 $where 都识别成 SQL Injection
// 而 403（attack_ID 20000008）。绕过办法：只发**单条件**的 $where。
//   - NAICS 722 = "Food Services and Drinking Places"，全国约 500 条；
//   - 用 starts_with(naics, '722') 一次拉回所有 NAICS 722 行，再在客户端过滤 BERKELEY situs city。
// 行数小 → fetch cost ≈ 1 request, 客户端过滤几十毫秒。比尝试多片 fetch 拼接更稳。
const NAICS_FOOD_PREFIX = '722';
const FETCH_PAGE = 500;

interface BerkeleyBizRecord {
  dba?: string;
  b1_business_name?: string;
  b1_full_address?: string;
  b1_address1?: string;
  b1_city?: string;
  b1_state?: string;
  b1_zip?: string;
  b1_situs_city?: string;
  busdesc?: string;
  naics?: string;
  recordid?: string;
}

function formatBerkeleyAddress(r: BerkeleyBizRecord): string | null {
  const full = pickText(r.b1_full_address);
  if (full && full !== '0 VARIOUS') return full;
  const line = pickText(r.b1_address1);
  const city = pickText(r.b1_city) || pickText(r.b1_situs_city);
  const z = pickText(r.b1_zip);
  if (!line) return null;
  const parts = [line, city, 'CA', z].filter(Boolean);
  return parts.join(', ');
}

/**
 * Berkeley 开放数据为「当前有效执照」快照，无开业/登记日期列；
 * license_date 置空 → 评分里「新执照」维度不计分，仍保留城市与菜系信号。
 */
export async function fetchBerkeleyFoodLeads(): Promise<{
  result: SourceFetchResult;
  leads: (FoodLeadDraft & { lead_score: number })[];
}> {
  const id = 'berkeley_open_data';
  const label = 'Berkeley（有效执照快照 · Business Licenses rwnf-bu3w）';

  // 单条件 $where：starts_with(naics, '722') —— 不含 OR / LIKE，可通过 WAF。
  // 全国 NAICS 722 数据约 500 条，单页可拉满，下面再客户端按 BERKELEY situs city 过滤。
  const params = new URLSearchParams({
    $where: `starts_with(naics, '${NAICS_FOOD_PREFIX}')`,
    $limit: String(FETCH_PAGE),
    $order: 'recordid DESC',
  });

  try {
    const response = await fetch(`${BERKELEY_API}?${params}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Referer: 'https://data.cityofberkeley.info/',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (!response.ok) {
      return {
        result: { id, label, ok: false, fetched: 0, error: `HTTP ${response.status}` },
        leads: [],
      };
    }

    const allRows = (await response.json()) as Record<string, unknown>[];

    // 客户端过滤：必须在 Berkeley city（situs city 或 city）
    const rows = allRows.filter((r) => {
      const situs = String(r.b1_situs_city ?? '').toUpperCase().trim();
      const city = String(r.b1_city ?? '').toUpperCase().trim();
      return situs === 'BERKELEY' || city === 'BERKELEY';
    });

    const leads: (FoodLeadDraft & { lead_score: number })[] = [];

    for (const row of rows) {
      const record = row as unknown as BerkeleyBizRecord;
      const nameRaw = record.dba || record.b1_business_name;
      if (!nameRaw || String(nameRaw).length < 2) continue;

      const name = String(record.dba || record.b1_business_name || 'Unknown');
      const cuisineType = buildCuisineLabel({
        naicsLine: record.naics,
        licLine: record.busdesc,
        businessName: record.b1_business_name,
        dba: record.dba,
      });

      const draft: FoodLeadDraft = {
        name,
        address: formatBerkeleyAddress(record),
        phone: null,
        cuisine_type: cuisineType,
        city: 'Berkeley',
        source: id,
        license_date: null,
        license_type: pickText(record.busdesc),
        source_raw: snapshotSourceRaw(row),
        lead_status: 'new',
      };

      leads.push({
        ...draft,
        lead_score: calculateLeadScore(draft as Partial<Lead>),
      });
    }

    return {
      result: { id, label, ok: true, fetched: leads.length },
      leads,
    };
  } catch (e) {
    return {
      result: {
        id,
        label,
        ok: false,
        fetched: 0,
        error: e instanceof Error ? e.message : 'fetch failed',
      },
      leads: [],
    };
  }
}
