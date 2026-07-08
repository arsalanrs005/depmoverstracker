import { NextResponse } from 'next/server';
import { DISPOSITION_OPTIONS } from '@/lib/cdr-parser';
import { submitDisposition } from '@/lib/db';
import { syncDispositionToGhl } from '@/lib/ghl-lookup';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { callId, dispositionCode, notes, callbackAt } = body;

    if (!callId || !dispositionCode) {
      return NextResponse.json({ error: 'callId and dispositionCode required' }, { status: 400 });
    }

    const option = DISPOSITION_OPTIONS.find((o) => o.code === dispositionCode);
    if (!option) {
      return NextResponse.json({ error: 'Invalid disposition code' }, { status: 400 });
    }

    if (option.code === 'callback-scheduled' && !callbackAt) {
      return NextResponse.json({ error: 'callbackAt required for callback-scheduled' }, { status: 400 });
    }

    const session = await submitDisposition({
      callId,
      dispositionCode,
      callOutcome: option.outcome,
      notes,
      callbackAt,
    });

    if (!session) {
      return NextResponse.json({ error: 'Call not found' }, { status: 404 });
    }

    let ghlResult: Record<string, unknown> = { skipped: true, reason: 'no_contact' };
    if (session.ghl_contact_id) {
      ghlResult = await syncDispositionToGhl({
        contactId: session.ghl_contact_id as string,
        dispositionCode,
        dispositionTag: option.tag,
        notes,
        callbackAt,
      });
    }

    return NextResponse.json({ ok: true, session, ghl: ghlResult });
  } catch (err) {
    console.error('Disposition submit error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
