import { calculateLeadScore } from '@/lib/scoring';
import type { Lead } from '@/types/lead';
import {
  FETCH_LIMIT,
  buildCuisineLabel,
  buildSfFoodServiceWhereClause,
  pickText,
  snapshotSourceRaw,
  type FoodLeadDraft,
  type SourceFetchResult,
} from './shared';

const SF_DATA_API = 'https://data.sfgov.org/resource/g8m3-pdis.json';

interface SFBusinessRecord {
  business_name?: string;
  dba_name?: string;
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
}

export async function fetchSanFranciscoFoodLeads(
  sinceDate: string
): Promise<{ result: SourceFetchResult; leads: (FoodLeadDraft & { lead_score: number })[] }> {
  const id = 'sf_gov';
  const label = 'San Francisco（新登记 · DataSF g8m3-pdis）';

  const params = new URLSearchParams({
    $where: buildSfFoodServiceWhereClause(sinceDate),
    $limit: String(FETCH_LIMIT),
    $order: 'location_start_date DESC',
  });

  try {
    const response = await fetch(`${SF_DATA_API}?${params}`, {
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
      const record = row as unknown as SFBusinessRecord;
      const nameRaw = record.business_name || record.dba_name;
      if (!nameRaw || String(nameRaw).length < 2) continue;

      const name = String(record.dba_name || record.business_name || 'Unknown');
      const cuisineType = buildCuisineLabel({
        naicsLine: record.naic_code_description,
        licLine:
          pickText(record.lic_code_description) ||
          pickText(record.lic_code_descriptions_list) ||
          pickText(record.lic),
        businessName: record.business_name,
        dba: record.dba_name,
      });
      const licenseDate = record.location_start_date || record.dba_start_date;
      const licenseType =
        pickText(record.lic_code_description) ||
        pickText(record.lic_code_descriptions_list) ||
        pickText(record.lic);

      const draft: FoodLeadDraft = {
        name,
        address: record.full_business_address || null,
        phone: record.business_phone || null,
        cuisine_type: cuisineType,
        city: 'San Francisco',
        source: 'sf_gov',
        license_date: licenseDate ? String(licenseDate).split('T')[0] : null,
        license_type: licenseType,
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
