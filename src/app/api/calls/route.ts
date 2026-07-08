import { NextResponse } from 'next/server';
import { listRecentCalls } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const calls = await listRecentCalls(50);
    return NextResponse.json({ calls });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 503 });
  }
}
