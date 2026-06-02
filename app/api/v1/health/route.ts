import { NextRequest } from 'next/server';
import { isApiV1Configured } from '@/lib/api-auth';
import { v1Json } from '@/lib/api-v1/response';
import { withApiV1Auth } from '@/lib/api-v1/with-auth';

export const GET = withApiV1Auth(async (_request: NextRequest) => {
  return v1Json({
    ok: true,
    service: 'restaurant-leads-finder',
    configured: isApiV1Configured(),
  });
});
