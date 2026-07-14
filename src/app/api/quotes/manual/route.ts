import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { getManualQuoteSheet, upsertManualQuoteRows } from '@/lib/db';
import {
  clampNonNegInt,
  formatPeriodLabel,
  todayEtYmd,
  weekStartFromDate,
  type ManualPeriodType,
} from '@/lib/quote-manual';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function canEdit(user: { role: string } | null) {
  return user?.role === 'admin' || user?.role === 'executive';
}

function resolvePeriod(periodType: ManualPeriodType, dateRaw: string | null) {
  const base = dateRaw && /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : todayEtYmd();
  const periodStart = periodType === 'week' ? weekStartFromDate(base) : base;
  return { periodStart, label: formatPeriodLabel(periodType, periodStart) };
}

export async function GET(request: Request) {
  const user = await getServerSession();
  if (!canEdit(user)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const periodType = searchParams.get('periodType') === 'week' ? 'week' : 'day';
    const { periodStart, label } = resolvePeriod(periodType, searchParams.get('date'));
    const rows = await getManualQuoteSheet(periodType, periodStart);
    return NextResponse.json({
      periodType,
      periodStart,
      label,
      rows,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const user = await getServerSession();
  if (!canEdit(user) || !user) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const periodType: ManualPeriodType = body.periodType === 'week' ? 'week' : 'day';
    const { periodStart, label } = resolvePeriod(periodType, body.date ?? body.periodStart ?? null);
    const incoming = Array.isArray(body.rows) ? body.rows : [];
    if (incoming.length === 0) {
      return NextResponse.json({ error: 'rows required' }, { status: 400 });
    }

    const rows = incoming
      .map((r: {
        agentId?: unknown;
        quotesCall?: unknown;
        quotesEmail?: unknown;
        depositsCollected?: unknown;
      }) => ({
        agentId: String(r.agentId ?? ''),
        quotesCall: clampNonNegInt(r.quotesCall),
        quotesEmail: clampNonNegInt(r.quotesEmail),
        depositsCollected: clampNonNegInt(r.depositsCollected),
      }))
      .filter((r: { agentId: string }) => r.agentId.length > 0);

    const result = await upsertManualQuoteRows({
      periodType,
      periodStart,
      enteredBy: user.email,
      rows,
    });

    return NextResponse.json({
      ok: true,
      ...result,
      periodType,
      periodStart,
      label,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
