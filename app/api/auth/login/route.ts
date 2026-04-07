import { NextRequest, NextResponse } from 'next/server';
import { createSessionToken, getSessionCookieName } from '@/lib/session';
import { verifyPasswordConstantTime } from '@/lib/auth-password';

export async function POST(request: NextRequest) {
  const secret = process.env.AUTH_SECRET;
  const allowedEmail = process.env.AUTH_ALLOWED_EMAIL?.trim().toLowerCase();
  const allowedPassword = process.env.AUTH_PASSWORD;

  if (!secret || secret.length < 16 || !allowedEmail || !allowedPassword) {
    return NextResponse.json(
      { error: '登录服务未配置（缺少 AUTH_SECRET / AUTH_ALLOWED_EMAIL / AUTH_PASSWORD）' },
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

  if (email !== allowedEmail) {
    return NextResponse.json({ error: '邮箱或密码错误' }, { status: 401 });
  }

  if (!verifyPasswordConstantTime(password, allowedPassword)) {
    return NextResponse.json({ error: '邮箱或密码错误' }, { status: 401 });
  }

  const token = await createSessionToken(allowedEmail);
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
