import type { BayAreaImportLead } from '@/lib/bay-area-food-import';
import { runBayAreaFoodImport } from '@/lib/bay-area-food-import';
import { fetchHoustonFoodLeads } from '@/lib/houston-food-import/houston';
import type { LeadRegionId } from '@/lib/region-config';
import type { SourceFetchResult } from '@/lib/bay-area-food-import/shared';

export type RegionalImportLead = BayAreaImportLead;

export async function runFoodImportForRegion(region: LeadRegionId): Promise<{
  sinceDate: string | null;
  sourceResults: SourceFetchResult[];
  leads: RegionalImportLead[];
}> {
  if (region === 'houston') {
    const { result, leads } = await fetchHoustonFoodLeads();
    return {
      sinceDate: null,
      sourceResults: [result],
      leads,
    };
  }

  const bay = await runBayAreaFoodImport();
  return {
    sinceDate: bay.sinceDate,
    sourceResults: bay.sourceResults,
    leads: bay.leads,
  };
}
