import { calculateLeadScore } from '@/lib/scoring';
import type { Lead } from '@/types/lead';
import {
  FETCH_LIMIT,
  buildBerkeleyFoodWhereClause,
  buildCuisineLabel,
  pickText,
  snapshotSourceRaw,
  type FoodLeadDraft,
  type SourceFetchResult,
} from './shared';

const BERKELEY_API = 'https://data.cityofberkeley.info/resource/rwnf-bu3w.json';

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

  const params = new URLSearchParams({
    $where: buildBerkeleyFoodWhereClause(),
    $limit: String(FETCH_LIMIT),
    $order: 'recordid DESC',
  });

  try {
    const response = await fetch(`${BERKELEY_API}?${params}`, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      return {
        result: { id, label, ok: false, fetched: 0, error: `HTTP ${response.status}` },
        leads: [],
      };
    }

    const rows = (await response.json()) as Record<string, unknown>[];
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
