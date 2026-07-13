import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { listInventoryIntakes } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const user = await getServerSession();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get('limit') ?? '100');
    const intakes = await listInventoryIntakes(Number.isFinite(limit) ? limit : 100);
    return NextResponse.json({ intakes });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
