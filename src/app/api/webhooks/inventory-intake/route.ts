import { NextResponse } from 'next/server';
import { logWebhook, upsertInventoryIntake } from '@/lib/db';
import {
  normalizeInventoryWebhookBody,
  parseInventoryIntake,
} from '@/lib/inventory-intake';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function authorizeWebhook(request: Request): boolean {
  const secret =
    process.env.INVENTORY_INTAKE_WEBHOOK_SECRET ||
    process.env.RETELL_WEBHOOK_SECRET ||
    process.env.IMPORT_API_SECRET;
  if (!secret) return true;
  const auth = request.headers.get('authorization');
  const queryToken = new URL(request.url).searchParams.get('token');
  return auth === `Bearer ${secret}` || queryToken === secret;
}

/**
 * After-hour Retell inventory intake webhook (n8n).
 * URL: https://YOUR-TRACKER.vercel.app/api/webhooks/inventory-intake?token=SECRET
 * Body: single object or array of intake payloads from Retell bot.
 */
export async function POST(request: Request) {
  if (!authorizeWebhook(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const raw = await request.json();
    const items = normalizeInventoryWebhookBody(raw);

    await logWebhook(
      'inventory_intake',
      'intake_posted',
      raw,
      String(
        (items[0] as { call_id?: string } | undefined)?.call_id ??
          (items[0] as { retell_call_id?: string } | undefined)?.retell_call_id ??
          ''
      )
    );

    if (items.length === 0) {
      return NextResponse.json({ ok: false, error: 'empty_payload' }, { status: 400 });
    }

    const results: Array<{ ok: boolean; created?: boolean; id?: string; callId?: string | null; error?: string }> =
      [];

    for (const item of items) {
      const parsed = parseInventoryIntake(item);
      if (!parsed) {
        results.push({ ok: false, error: 'parse_failed' });
        continue;
      }
      const { row, created } = await upsertInventoryIntake(parsed);
      results.push({
        ok: true,
        created,
        id: row?.id ? String(row.id) : undefined,
        callId: parsed.retellCallId,
      });
    }

    const okCount = results.filter((r) => r.ok).length;
    return NextResponse.json({
      ok: okCount > 0,
      received: items.length,
      saved: okCount,
      results,
    });
  } catch (err) {
    console.error('Inventory intake webhook error:', err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: '/api/webhooks/inventory-intake',
    hint: 'POST after-hour Retell inventory intake payloads from n8n (object or array)',
  });
}
