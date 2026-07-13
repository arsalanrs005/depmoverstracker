import type { SessionUser, UserRole } from './auth-types';
import { displayName, getSessionCookieName, sessionSecret } from './auth-types';

export { getSessionCookieName } from './auth-types';

function base64urlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function signPayload(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(sessionSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return base64urlEncode(new Uint8Array(sig));
}

export async function verifySessionTokenEdge(
  token: string | undefined | null
): Promise<SessionUser | null> {
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;

  const expected = await signPayload(payload);
  if (sig.length !== expected.length) return null;
  let valid = true;
  for (let i = 0; i < sig.length; i++) {
    if (sig.charCodeAt(i) !== expected.charCodeAt(i)) valid = false;
  }
  if (!valid) return null;

  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const data = JSON.parse(json) as {
      email?: string;
      role?: UserRole;
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
