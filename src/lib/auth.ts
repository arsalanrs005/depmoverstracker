import { createHmac, timingSafeEqual } from 'crypto';
import type { SessionUser } from './auth-types';
import {
  displayName,
  getSessionCookieName,
  sessionSecret,
  SESSION_DAYS,
} from './auth-types';

export type { SessionUser, UserRole } from './auth-types';
export {
  canAccessPath,
  defaultHomeForRole,
  displayName,
  getSessionCookieName,
  roleLabel,
  sessionCookieOptions,
} from './auth-types';

const COOKIE_NAME = getSessionCookieName();

function sign(payload: string): string {
  return createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
}

export function verifyPassword(password: string): boolean {
  const expected = process.env.AUTH_PASSWORD;
  if (!expected) {
    if (process.env.NODE_ENV === 'production') return false;
    return password === 'dev';
  }
  const a = Buffer.from(password);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function createSessionToken(user: SessionUser): string {
  const exp = Date.now() + SESSION_DAYS * 86_400_000;
  const payload = Buffer.from(
    JSON.stringify({ email: user.email, role: user.role, name: user.name, exp }),
    'utf8'
  ).toString('base64url');
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

export function verifySessionToken(token: string | undefined | null): SessionUser | null {
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;

  const expected = sign(payload);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      email?: string;
      role?: SessionUser['role'];
      name?: string;
      exp?: number;
    };
    if (!data.email || !data.role || !data.exp || data.exp < Date.now()) return null;
    if (data.role !== 'admin' && data.role !== 'executive') return null;
    return {
      email: data.email,
      role: data.role,
      name: data.name ?? displayName(data.email),
    };
  } catch {
    return null;
  }
}

/** Validates cookie against DB (API routes / server components). */
export async function getServerSession(): Promise<SessionUser | null> {
  const { cookies } = await import('next/headers');
  const { lookupAppUser } = await import('./auth-users');
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const fromToken = verifySessionToken(token);
  if (!fromToken) return null;
  const fromDb = await lookupAppUser(fromToken.email);
  if (!fromDb || fromDb.role !== fromToken.role) return null;
  return fromDb;
}
