import { NextRequest, NextResponse } from 'next/server';
import { isWorkCdrConfigured, syncWorkCdr } from '@/lib/x8x-work-cdr';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

/** Manual trigger: POST /api/sync/work-cdr { "sinceMinutes": 60 } */
export async function POST(request: NextRequest) {
  if (!isWorkCdrConfigured()) {
    return NextResponse.json({
      ok: false,
      error: 'missing_env',
      required: ['X8X_WORK_API_KEY', 'X8X_WORK_USERNAME', 'X8X_WORK_PASSWORD'],
    }, { status: 503 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const sinceMinutes = body.sinceMinutes ?? 60;
    const result = await syncWorkCdr({ sinceMinutes });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('Manual work CDR sync:', err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
