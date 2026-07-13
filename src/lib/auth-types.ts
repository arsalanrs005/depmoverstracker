export type UserRole = 'admin' | 'executive';

export type SessionUser = {
  email: string;
  role: UserRole;
  name: string;
};

const COOKIE_NAME = 'dm_session';
export const SESSION_DAYS = 7;

/** Where each role lands after login */
export function defaultHomeForRole(role: UserRole): string {
  return role === 'executive' ? '/agent/dispositions' : '/manager/dashboard';
}

export function displayName(email: string): string {
  const local = email.split('@')[0] ?? email;
  return local.replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function sessionSecret(): string {
  const secret = process.env.AUTH_SECRET ?? process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('AUTH_SECRET is required in production');
    }
    return 'dev-only-auth-secret-change-me';
  }
  return secret;
}

export function getSessionCookieName() {
  return COOKIE_NAME;
}

const EXECUTIVE_PREFIXES = [
  '/agent/dispositions',
  '/manager/quotes',
  '/manager/inventory-intake',
  '/api/dispositions/',
  '/api/quotes/entry',
  '/api/inventory-intakes',
  '/api/agents',
];

const ADMIN_BLOCKED_PREFIXES = [
  '/agent/dispositions',
  '/api/dispositions/',
  '/api/quotes/entry',
];

export function canAccessPath(role: UserRole, pathname: string): boolean {
  if (role === 'executive') {
    return EXECUTIVE_PREFIXES.some((p) => pathname.startsWith(p));
  }
  if (ADMIN_BLOCKED_PREFIXES.some((p) => pathname.startsWith(p))) return false;
  return true;
}

export function roleLabel(role: UserRole): string {
  return role === 'admin' ? 'Admin' : 'Executive';
}

export function sessionCookieOptions() {
  return {
    name: COOKIE_NAME,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_DAYS * 86_400,
  };
}
