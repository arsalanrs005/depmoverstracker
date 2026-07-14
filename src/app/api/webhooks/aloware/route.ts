import { NextResponse } from 'next/server';
import { logWebhook, upsertAlowareCallDisposed } from '@/lib/db';
import { parseAlowareWebhook, isAlowareCallDisposedEvent } from '@/lib/aloware-webhook';
import { getAlowareDispositionByCode } from '@/lib/aloware-dispositions';
import { findGhlContactByPhone, syncDispositionToGhl } from '@/lib/ghl-lookup';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function authorizeWebhook(request: Request): boolean {
  const secret = process.env.ALOWARE_WEBHOOK_SECRET;
  if (!secret) return true;
  const auth = request.headers.get('authorization');
  const queryToken = new URL(request.url).searchParams.get('token');
  return auth === `Bearer ${secret}` || queryToken === secret;
}

/**
 * Aloware webhook: Call Disposed / Communication Disposed
 * Configure in Aloware Admin → Integrations → Webhooks
 * URL: https://YOUR-TRACKER.vercel.app/api/webhooks/aloware?token=SECRET
 * Events: Call disposed, Communication disposed (filter: completed)
 */
export async function POST(request: Request) {
  if (!authorizeWebhook(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const raw = await request.json();
    const event = String((raw as { event?: string }).event ?? 'unknown');

    await logWebhook('aloware', event, raw, String((raw as { body?: { id?: string } }).body?.id ?? ''));

    if (!isAlowareCallDisposedEvent(event)) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'event_not_handled', event });
    }

    const parsed = parseAlowareWebhook(raw);
    if (!parsed) {
      return NextResponse.json({ ok: false, error: 'parse_failed' }, { status: 400 });
    }

    if (!parsed.ghlContactId) {
      const match = await findGhlContactByPhone(parsed.phone);
      if (match?.contactId) parsed.ghlContactId = match.contactId;
    }

    const { session, created } = await upsertAlowareCallDisposed(parsed);

    let ghl: Record<string, unknown> = { skipped: true };
    if (session?.ghl_contact_id && parsed.dispositionCode) {
      const option = getAlowareDispositionByCode(parsed.dispositionCode);
      if (option) {
        ghl = await syncDispositionToGhl({
          contactId: session.ghl_contact_id as string,
          dispositionCode: parsed.dispositionCode,
          dispositionTag: option.ghlTag,
          notes: parsed.notes ?? undefined,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      created,
      event,
      communicationId: parsed.communicationId,
      track: 'aloware_closer',
      disposition: parsed.dispositionCode,
      dispositionLabel: parsed.dispositionLabel,
      quoteType: parsed.quoteType,
      ghl,
    });
  } catch (err) {
    console.error('Aloware webhook error:', err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: '/api/webhooks/aloware',
    hint: 'POST Aloware Call Disposed events here',
  });
}
