import { NextResponse } from 'next/server';
import type { ApiV1AuthContext } from '@/lib/api-auth';

export function v1Json<T extends Record<string, unknown>>(
  data: T,
  init?: { status?: number; ctx?: ApiV1AuthContext },
): NextResponse {
  return NextResponse.json(
    {
      api_version: 'v1',
      ...data,
    },
    { status: init?.status ?? 200 },
  );
}

export function v1Error(
  error: string,
  status: number,
  detail?: string,
): NextResponse {
  return NextResponse.json(
    {
      api_version: 'v1',
      error,
      ...(detail ? { detail } : {}),
    },
    { status },
  );
}
