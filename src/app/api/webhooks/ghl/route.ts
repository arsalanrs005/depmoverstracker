import { NextRequest, NextResponse } from 'next/server';
import { logWebhook } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** GHL opportunity stage webhooks — T4 deal_events. Stub accepts and logs. */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const payload = body as Record<string, unknown>;
  const type = String(payload.type ?? payload.event ?? 'unknown');
  await logWebhook('ghl', type, body);

  // TODO T4: parse opp stage → deal_events table
  return NextResponse.json({ ok: true, type, note: 'logged' });
}
