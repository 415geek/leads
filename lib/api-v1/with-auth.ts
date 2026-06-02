import type { NextRequest } from 'next/server';
import { requireApiV1Auth, type ApiV1AuthContext, type ApiV1Scope } from '@/lib/api-auth';
import { v1Error } from '@/lib/api-v1/response';

export type V1Handler = (
  request: NextRequest,
  ctx: ApiV1AuthContext,
) => Promise<Response>;

export type V1HandlerWithParams<P> = (
  request: NextRequest,
  ctx: ApiV1AuthContext,
  routeContext: { params: Promise<P> },
) => Promise<Response>;

export function withApiV1Auth(handler: V1Handler, scope: ApiV1Scope = 'read') {
  return async (request: NextRequest): Promise<Response> => {
    const auth = requireApiV1Auth(request.headers, scope);
    if (!auth.ok) {
      return v1Error(auth.error, auth.status);
    }
    try {
      return await handler(request, auth.ctx);
    } catch (error) {
      console.error('[api/v1]', error);
      const msg = error instanceof Error ? error.message : String(error);
      const hint =
        /column .* does not exist/i.test(msg) || /42703/.test(msg)
          ? 'Supabase schema migration 未执行。请在 Supabase SQL Editor 运行 supabase/schema.sql。'
          : undefined;
      return v1Error('请求失败', 500, hint ? `${msg} — ${hint}` : msg);
    }
  };
}

export function withApiV1AuthParams<P extends Record<string, string>>(
  handler: V1HandlerWithParams<P>,
  scope: ApiV1Scope = 'read',
) {
  return async (
    request: NextRequest,
    routeContext: { params: Promise<P> },
  ): Promise<Response> => {
    const auth = requireApiV1Auth(request.headers, scope);
    if (!auth.ok) {
      return v1Error(auth.error, auth.status);
    }
    try {
      return await handler(request, auth.ctx, routeContext);
    } catch (error) {
      console.error('[api/v1]', error);
      const msg = error instanceof Error ? error.message : String(error);
      const hint =
        /column .* does not exist/i.test(msg) || /42703/.test(msg)
          ? 'Supabase schema migration 未执行。请在 Supabase SQL Editor 运行 supabase/schema.sql。'
          : undefined;
      return v1Error('请求失败', 500, hint ? `${msg} — ${hint}` : msg);
    }
  };
}
