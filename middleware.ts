import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySessionToken, getSessionCookieName } from '@/lib/session';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith('/_next/static') ||
    pathname.startsWith('/_next/image') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  if (/\.(?:svg|png|jpg|jpeg|gif|webp|ico)$/i.test(pathname)) {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get(getSessionCookieName())?.value;
  const isAuthed = sessionCookie ? await verifySessionToken(sessionCookie) : false;

  if (pathname === '/login') {
    if (isAuthed) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/auth/login')) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/auth/logout')) {
    return NextResponse.next();
  }

  // n8n 等自动化：凭 x-webhook-secret 校验，不走浏览器登录
  if (pathname === '/api/leads/upsert' || pathname === '/api/leads/filings/sync') {
    return NextResponse.next();
  }

  // Vercel Cron：凭 Authorization: Bearer <CRON_SECRET> 校验
  if (pathname.startsWith('/api/cron/')) {
    return NextResponse.next();
  }

  // API v1：凭 API_V1_KEY / API_V1_KEYS，在 route handler 内校验
  if (pathname.startsWith('/api/v1/')) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/')) {
    if (!isAuthed) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }
    return NextResponse.next();
  }

  if (!isAuthed) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('from', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
