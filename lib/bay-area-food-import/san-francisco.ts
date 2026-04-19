import { calculateLeadScore } from '@/lib/scoring';
import type { Lead } from '@/types/lead';
import { sfG8m3DisplayName, sfG8m3LegalNameForCuisine, type SfG8m3Shape } from '@/lib/sf-data-sf-fields';
import {
  indexClosedRecordsByBaseAddress,
  isDatasfActiveLocationRow,
  computeDatasfNewOpeningIntel,
  matchDatasfTransfer,
  mergeOpeningSignals,
} from '@/lib/datasf-opening-intel';
import {
  SF_G8M3_FETCH_LIMIT,
  buildCuisineLabel,
  buildSfClosedFoodWhereClause,
  buildSfFoodServiceWhereClause,
  pickText,
  snapshotSourceRaw,
  type FoodLeadDraft,
  type SourceFetchResult,
} from './shared';

const SF_DATA_API = 'https://data.sfgov.org/resource/g8m3-pdis.json';
/** 拉取近期关店行，供同址转手推断（与单次 active 上限分开） */
const SF_CLOSED_FETCH_LIMIT = 2000;
const SF_CLOSED_LOCATION_LOOKBACK_DAYS = 500;

function isoDateDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}

/** DataSF g8m3-pdis：现行字段以 ownership_name + dba_name 为主，部分行仍有 business_name / NAICS / 执照 */
type SFBusinessRecord = SfG8m3Shape & {
  full_business_address?: string;
  business_phone?: string;
  naic_code?: string;
  naic_code_description?: string;
  lic_code_description?: string;
  lic_code_descriptions_list?: string;
  lic?: string;
  dba_start_date?: string;
  location_start_date?: string;
  city?: string;
};

export async function fetchSanFranciscoFoodLeads(
  sinceDate: string
): Promise<{ result: SourceFetchResult; leads: (FoodLeadDraft & { lead_score: number })[] }> {
  const id = 'sf_gov';
  const label =
    'DataSF g8m3-pdis（湾区实地城市 · SF 税务登记，近 location_start_date + 新开店/转手推断）';

  const params = new URLSearchParams({
    $where: buildSfFoodServiceWhereClause(sinceDate),
    $limit: String(SF_G8M3_FETCH_LIMIT),
    $order: 'location_start_date DESC',
  });

  const closedSince = isoDateDaysAgo(SF_CLOSED_LOCATION_LOOKBACK_DAYS);
  const closedParams = new URLSearchParams({
    $where: buildSfClosedFoodWhereClause(closedSince),
    $limit: String(SF_CLOSED_FETCH_LIMIT),
    $order: 'location_end_date DESC',
  });

  try {
    const [activeRes, closedRes] = await Promise.all([
      fetch(`${SF_DATA_API}?${params}`, { headers: { Accept: 'application/json' } }),
      fetch(`${SF_DATA_API}?${closedParams}`, { headers: { Accept: 'application/json' } }),
    ]);

    if (!activeRes.ok) {
      return {
        result: { id, label, ok: false, fetched: 0, error: `HTTP ${activeRes.status}` },
        leads: [],
      };
    }

    const rows = (await activeRes.json()) as Record<string, unknown>[];
    let closedRows: Record<string, unknown>[] = [];
    if (closedRes.ok) {
      closedRows = (await closedRes.json()) as Record<string, unknown>[];
    }
    const closedIdx = indexClosedRecordsByBaseAddress(closedRows);
    const refDate = new Date();

    const leads: (FoodLeadDraft & { lead_score: number })[] = [];

    for (const row of rows) {
      const record = row as unknown as SFBusinessRecord;
      if (!isDatasfActiveLocationRow(record)) continue;

      const name = sfG8m3DisplayName(record);
      if (!name || name.length < 2) continue;

      const cuisineType = buildCuisineLabel({
        naicsLine: record.naic_code_description,
        licLine:
          pickText(record.lic_code_description) ||
          pickText(record.lic_code_descriptions_list) ||
          pickText(record.lic),
        businessName: sfG8m3LegalNameForCuisine(record),
        dba: pickText(record.dba_name),
      });
      const licenseDate = record.location_start_date || record.dba_start_date;
      const licenseType =
        pickText(record.lic_code_description) ||
        pickText(record.lic_code_descriptions_list) ||
        pickText(record.lic);

      const cityFromRecord =
        pickText(record.city)?.replace(/\s+/g, ' ').trim() || null;

      const baseOpening = computeDatasfNewOpeningIntel(record, refDate, { newOpeningWindowDays: 90 });
      const priors = closedIdx.get(baseOpening.normalized_address_key) ?? [];
      const transfer = matchDatasfTransfer(record, priors, refDate, { transferWindowDays: 120 });
      const signals = mergeOpeningSignals(baseOpening, transfer);

      const rawSnapshot = snapshotSourceRaw(row) as Record<string, unknown>;
      rawSnapshot.opening_signals = signals;

      const draft: FoodLeadDraft = {
        name,
        address: record.full_business_address || null,
        phone: record.business_phone || null,
        cuisine_type: cuisineType,
        city: cityFromRecord || 'San Francisco',
        source: 'sf_gov',
        license_date: licenseDate ? String(licenseDate).split('T')[0] : null,
        license_type: licenseType,
        source_raw: rawSnapshot as FoodLeadDraft['source_raw'],
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
