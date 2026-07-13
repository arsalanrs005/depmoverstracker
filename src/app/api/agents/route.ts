import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { listAgents } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const user = await getServerSession();
  if (!user || user.role !== 'executive') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get('platform');
    const team = searchParams.get('team');
    const agents = await listAgents({
      platform: platform === '8x8' || platform === 'aloware' ? platform : undefined,
      team: team ?? undefined,
    });
    return NextResponse.json({ agents });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
