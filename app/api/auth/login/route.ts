import { NextRequest, NextResponse } from 'next/server';
import { createSessionToken, getSessionCookieName } from '@/lib/session';
import { verifyPasswordConstantTime } from '@/lib/auth-password';
import { getAuthCredentialMap, isAuthSecretConfigured } from '@/lib/auth-users';

export async function POST(request: NextRequest) {
  const credentials = getAuthCredentialMap();

  if (!isAuthSecretConfigured() || credentials.size === 0) {
    return NextResponse.json(
      {
        error:
          '登录服务未配置（需要 AUTH_SECRET≥16 字符，且至少配置 AUTH_ALLOWED_EMAIL+AUTH_PASSWORD 或 AUTH_USERS_JSON）',
      },
      { status: 503 },
    );
  }

  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? '';

  if (!email) {
    return NextResponse.json({ error: '邮箱或密码错误' }, { status: 401 });
  }

  const allowedPassword = credentials.get(email);
  if (!allowedPassword) {
    return NextResponse.json({ error: '邮箱或密码错误' }, { status: 401 });
  }

  if (!verifyPasswordConstantTime(password, allowedPassword)) {
    return NextResponse.json({ error: '邮箱或密码错误' }, { status: 401 });
  }

  const token = await createSessionToken(email);
  if (!token) {
    return NextResponse.json({ error: '无法创建会话' }, { status: 500 });
  }

  const res = NextResponse.json({ ok: true });
  const isProd = process.env.NODE_ENV === 'production';
  res.cookies.set(getSessionCookieName(), token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  });
  return res;
}
