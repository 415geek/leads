/**
 * API v1 鉴权 —— 机器对机器访问，与浏览器 session 分离。
 *
 * 环境变量：
 *   API_V1_KEYS —— 逗号分隔的 API Key 列表（建议 ≥32 字符随机串）
 *   或 API_V1_KEY —— 单个 Key（向后兼容）
 *
 * 请求头（任选其一）：
 *   Authorization: Bearer <key>
 *   X-API-Key: <key>
 */

export type ApiV1Scope = 'read' | 'write' | 'admin';

export interface ApiV1AuthContext {
  keyId: string;
  scopes: ApiV1Scope[];
}

function parseKeysFromEnv(): Map<string, ApiV1Scope[]> {
  const map = new Map<string, ApiV1Scope[]>();

  const single = process.env.API_V1_KEY?.trim();
  if (single) {
    map.set(single, ['read', 'write', 'admin']);
  }

  const multi = process.env.API_V1_KEYS?.trim();
  if (multi) {
    for (const part of multi.split(',')) {
      const trimmed = part.trim();
      if (trimmed) {
        map.set(trimmed, ['read', 'write', 'admin']);
      }
    }
  }

  return map;
}

export function isApiV1Configured(): boolean {
  return parseKeysFromEnv().size > 0;
}

export function extractApiKeyFromHeaders(headers: Headers): string | null {
  const auth = headers.get('authorization')?.trim();
  if (auth?.toLowerCase().startsWith('bearer ')) {
    const token = auth.slice(7).trim();
    if (token) return token;
  }
  const xKey = headers.get('x-api-key')?.trim();
  if (xKey) return xKey;
  return null;
}

export function verifyApiV1Key(key: string | null): ApiV1AuthContext | null {
  if (!key) return null;
  const keys = parseKeysFromEnv();
  const scopes = keys.get(key);
  if (!scopes) return null;
  const keyId = key.length > 8 ? `${key.slice(0, 4)}…${key.slice(-4)}` : 'key';
  return { keyId, scopes };
}

export function hasScope(ctx: ApiV1AuthContext, scope: ApiV1Scope): boolean {
  if (ctx.scopes.includes('admin')) return true;
  if (scope === 'read') return ctx.scopes.includes('read') || ctx.scopes.includes('write');
  return ctx.scopes.includes(scope);
}

export function requireApiV1Auth(
  headers: Headers,
  requiredScope: ApiV1Scope = 'read',
): { ok: true; ctx: ApiV1AuthContext } | { ok: false; status: number; error: string } {
  if (!isApiV1Configured()) {
    return {
      ok: false,
      status: 503,
      error: 'API v1 未配置。请在环境变量设置 API_V1_KEY 或 API_V1_KEYS。',
    };
  }

  const key = extractApiKeyFromHeaders(headers);
  const ctx = verifyApiV1Key(key);
  if (!ctx) {
    return { ok: false, status: 401, error: '无效的 API Key' };
  }

  if (!hasScope(ctx, requiredScope)) {
    return { ok: false, status: 403, error: `需要 ${requiredScope} 权限` };
  }

  return { ok: true, ctx };
}
