import type { SessionUser, UserRole } from './auth-types';
import { displayName } from './auth-types';
import { getDb } from './db';

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function lookupAppUser(email: string): Promise<SessionUser | null> {
  const normalized = normalizeEmail(email);
  const db = getDb();
  const rows = await db`
    SELECT email, role, display_name
    FROM app_users
    WHERE email = ${normalized} AND active = true
    LIMIT 1
  `;
  const row = rows[0] as { email: string; role: string; display_name: string | null } | undefined;
  if (!row) return null;
  if (row.role !== 'admin' && row.role !== 'executive') return null;
  return {
    email: row.email,
    role: row.role as UserRole,
    name: row.display_name?.trim() || displayName(row.email),
  };
}
