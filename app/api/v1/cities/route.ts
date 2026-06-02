import { NextRequest } from 'next/server';
import { listLeadCities } from '@/lib/leads/query-leads';
import { v1Json } from '@/lib/api-v1/response';
import { withApiV1Auth } from '@/lib/api-v1/with-auth';
import type { LeadRegionFilterId } from '@/lib/region-config';

export const GET = withApiV1Auth(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const region = (searchParams.get('region') || 'all') as LeadRegionFilterId;
  const q = searchParams.get('q') ?? undefined;
  const result = await listLeadCities(region, q);
  return v1Json(result);
});
