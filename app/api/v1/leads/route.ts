import { NextRequest } from 'next/server';
import { listLeads, parseListLeadsFromSearchParams } from '@/lib/leads/query-leads';
import { v1Json } from '@/lib/api-v1/response';
import { withApiV1Auth } from '@/lib/api-v1/with-auth';

export const GET = withApiV1Auth(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const result = await listLeads(parseListLeadsFromSearchParams(searchParams));
  return v1Json(result);
});
