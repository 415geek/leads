import { NextRequest } from 'next/server';
import { listMapMarkers } from '@/lib/leads/query-leads';
import { v1Json } from '@/lib/api-v1/response';
import { withApiV1Auth } from '@/lib/api-v1/with-auth';

export const GET = withApiV1Auth(async (_request: NextRequest) => {
  const result = await listMapMarkers();
  return v1Json(result);
});
