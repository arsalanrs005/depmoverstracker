import { NextResponse } from 'next/server';
import {
  createSessionToken,
  sessionCookieOptions,
  verifyPassword,
} from '@/lib/auth';
import { defaultHomeForRole } from '@/lib/auth-types';
import { lookupAppUser } from '@/lib/auth-users';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = String(body.email ?? '');
    const password = String(body.password ?? '');

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
    }

    if (!verifyPassword(password)) {
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
    }

    const user = await lookupAppUser(email);
    if (!user) {
      return NextResponse.json({ error: 'Email not authorized' }, { status: 403 });
    }

    const token = createSessionToken(user);

    const res = NextResponse.json({
      ok: true,
      role: user.role,
      email: user.email,
      home: defaultHomeForRole(user.role),
    });
    const opts = sessionCookieOptions();
    res.cookies.set(opts.name, token, {
      httpOnly: opts.httpOnly,
      secure: opts.secure,
      sameSite: opts.sameSite,
      path: opts.path,
      maxAge: opts.maxAge,
    });
    return res;
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
