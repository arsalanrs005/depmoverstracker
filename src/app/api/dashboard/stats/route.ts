import { NextResponse } from 'next/server';
import { getDashboardStats, type DashboardPeriod } from '@/lib/db';
import { isValidTrack, type CallTrack } from '@/lib/tracks';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const period = (searchParams.get('period') ?? 'day') as DashboardPeriod;
    const trackParam = searchParams.get('track');
    const track = trackParam && isValidTrack(trackParam) ? (trackParam as CallTrack) : undefined;

    if (!['day', 'week', 'month'].includes(period)) {
      return NextResponse.json({ error: 'Invalid period' }, { status: 400 });
    }
    const stats = await getDashboardStats(period, track);
    return NextResponse.json(stats);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
