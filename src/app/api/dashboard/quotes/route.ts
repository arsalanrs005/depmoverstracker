import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { getQuoteTrackingStats, type DashboardPeriod } from '@/lib/db';
import type { CallTrack } from '@/lib/tracks';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const user = await getServerSession();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const period = (searchParams.get('period') ?? 'week') as DashboardPeriod;
    const trackParam = searchParams.get('track');
    const track =
      trackParam === 'aloware_closer' || trackParam === '8x8_closer'
        ? (trackParam as CallTrack)
        : undefined;

    if (!['day', 'week', 'month'].includes(period)) {
      return NextResponse.json({ error: 'Invalid period' }, { status: 400 });
    }

    const data = await getQuoteTrackingStats(period, track);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
