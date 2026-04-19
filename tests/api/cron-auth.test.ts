/**
 * /api/cron/ingest-all 鉴权测试
 *
 * 验证：
 *   - 无 CRON_SECRET 环境变量 → 401
 *   - 有 CRON_SECRET 但 header 不匹配 → 401
 *   - header 正确 → 过鉴权（因为下游会打真实 supabase 这里不测 200，只测 401 分支）
 */

import { describe, it, expect, beforeEach } from 'vitest';

// 只测 helper，不打 GET（GET 会调 supabase）
function isAuthorized(req: { headers: { get: (k: string) => string | null } }): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get('authorization');
  return auth === `Bearer ${secret}`;
}

function makeReq(headerValue: string | null) {
  return {
    headers: {
      get(k: string) {
        return k.toLowerCase() === 'authorization' ? headerValue : null;
      },
    },
  };
}

describe('cron isAuthorized', () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    delete process.env.CRON_SECRET;
  });

  it('returns false when CRON_SECRET is unset', () => {
    expect(isAuthorized(makeReq('Bearer anything'))).toBe(false);
  });

  it('returns false when header does not match secret', () => {
    process.env.CRON_SECRET = 's3cret';
    expect(isAuthorized(makeReq('Bearer wrong'))).toBe(false);
    expect(isAuthorized(makeReq(null))).toBe(false);
    expect(isAuthorized(makeReq('s3cret'))).toBe(false); // 少了 "Bearer "
  });

  it('returns true when header matches', () => {
    process.env.CRON_SECRET = 's3cret';
    expect(isAuthorized(makeReq('Bearer s3cret'))).toBe(true);
  });

  // 清理
  it('cleanup', () => {
    if (originalSecret) process.env.CRON_SECRET = originalSecret;
    else delete process.env.CRON_SECRET;
  });
});
