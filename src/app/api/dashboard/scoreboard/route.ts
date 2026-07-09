import { NextResponse } from 'next/server';
import { getScoreboardStats, type ScoreboardTeamFilter } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const VALID: ScoreboardTeamFilter[] = ['all', 'aloware', '8x8'];

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const teamParam = searchParams.get('team') ?? 'all';
    const team = VALID.includes(teamParam as ScoreboardTeamFilter)
      ? (teamParam as ScoreboardTeamFilter)
      : 'all';

    const data = await getScoreboardStats(team);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
