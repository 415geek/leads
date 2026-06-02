import { NextRequest } from 'next/server';
import { REGION_OPTIONS } from '@/lib/region-config';
import { v1Json } from '@/lib/api-v1/response';
import { withApiV1Auth } from '@/lib/api-v1/with-auth';

/** GET /api/v1/regions — 与网页版地区筛选下拉一致 */
export const GET = withApiV1Auth(async (_request: NextRequest) => {
  return v1Json({ regions: REGION_OPTIONS });
});
