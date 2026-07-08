import { NextResponse } from 'next/server';
import { listPendingDispositions } from '@/lib/db';
import { isValidTrack, type CallTrack } from '@/lib/tracks';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('agent_id_8x8') ?? undefined;
    const trackParam = searchParams.get('track');
    const track = trackParam && isValidTrack(trackParam) ? (trackParam as CallTrack) : undefined;

    const calls = await listPendingDispositions({ agentId8x8: agentId, track });
    return NextResponse.json({ calls, count: calls.length, track: track ?? '8x8_all' });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
