import { NextRequest, NextResponse } from 'next/server';
import { syncPendingCallsToGhl } from '@/lib/ghl';
import { isWorkCdrConfigured, syncWorkCdr } from '@/lib/x8x-work-cdr';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

function authorizeCron(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = request.headers.get('authorization');
  return auth === `Bearer ${secret}`;
}

/**
 * Poll 8x8 Work Analytics CDR API (Basic plan — not CC).
 * Vercel cron: every 5 minutes. Fetches last 30 min by default.
 */
export async function GET(request: NextRequest) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  if (!isWorkCdrConfigured()) {
    return NextResponse.json({
      ok: false,
      error: 'missing_env',
      hint: 'Set X8X_WORK_API_KEY, X8X_WORK_USERNAME, X8X_WORK_PASSWORD',
    }, { status: 503 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const sinceMinutes = searchParams.get('sinceMinutes');
    const work = await syncWorkCdr({
      sinceMinutes: sinceMinutes ? Number(sinceMinutes) : undefined,
    });

    const ghl = process.env.GHL_API_KEY
      ? { results: await syncPendingCallsToGhl() }
      : { skipped: true as const };

    return NextResponse.json({
      ok: true,
      source: '8x8-work-cdr-api',
      work,
      ghl,
      at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Work CDR sync error:', err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
