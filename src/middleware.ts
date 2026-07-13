import { NextRequest, NextResponse } from 'next/server';
import { canAccessPath, defaultHomeForRole } from '@/lib/auth-types';
import { getSessionCookieName, verifySessionTokenEdge } from '@/lib/auth-edge';

const PUBLIC_PREFIXES = [
  '/login',
  '/api/auth/',
  '/api/webhooks/',
  '/api/cron/',
  '/api/health',
  '/api/imports/',
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.ico')
  ) {
    return NextResponse.next();
  }

  if (isPublic(pathname)) {
    if (pathname === '/login') {
      const token = request.cookies.get(getSessionCookieName())?.value;
      const user = await verifySessionTokenEdge(token);
      if (user) {
        return NextResponse.redirect(new URL(defaultHomeForRole(user.role), request.url));
      }
    }
    return NextResponse.next();
  }

  const token = request.cookies.get(getSessionCookieName())?.value;
  const user = await verifySessionTokenEdge(token);

  if (!user) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const login = new URL('/login', request.url);
    login.searchParams.set('next', pathname);
    return NextResponse.redirect(login);
  }

  if (!canAccessPath(user.role, pathname)) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    return NextResponse.redirect(new URL(defaultHomeForRole(user.role), request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
