import { NextRequest, NextResponse } from 'next/server';
import {
  logWebhook,
  updateRetellCallAnalyzed,
  updateRetellCallEnded,
  upsertRetellCallStarted,
} from '@/lib/db';
import { computeCallOutcome } from '@/lib/disposition';

export const dynamic = 'force-dynamic';
import { syncCallToGhl } from '@/lib/ghl';
import { parseRetellEvent, type RetellWebhookBody } from '@/lib/retell';

export async function POST(request: NextRequest) {
  let body: RetellWebhookBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = parseRetellEvent(body);
  await logWebhook('retell', parsed.event, body, parsed.retellCallId);

  if (!parsed.retellCallId) {
    return NextResponse.json({ ok: true, skipped: 'no_call_id' });
  }

  let session: Record<string, unknown> | null = null;

  switch (parsed.event) {
    case 'call_started':
      session = (await upsertRetellCallStarted({
        retellCallId: parsed.retellCallId,
        phone: parsed.phone,
        ghlContactId: parsed.ghlContactId,
        ghlOpportunityId: parsed.ghlOpportunityId,
        retellAgentId: parsed.retellAgentId,
      })) as Record<string, unknown>;
      break;

    case 'call_ended':
      session = (await updateRetellCallEnded({
        retellCallId: parsed.retellCallId,
        durationSec: parsed.durationSec,
      })) as Record<string, unknown> | null;
      break;

    case 'call_analyzed': {
      const outcome = computeCallOutcome({ retellOutcome: parsed.retellOutcome });
      session = (await updateRetellCallAnalyzed({
        retellCallId: parsed.retellCallId,
        transcript: parsed.transcript,
        analysis: parsed.analysis,
        callOutcome: outcome !== 'pending' ? outcome : undefined,
      })) as Record<string, unknown> | null;

      if (session && process.env.GHL_API_KEY && session.call_outcome !== 'pending') {
        await syncCallToGhl(session as Parameters<typeof syncCallToGhl>[0]).catch(() => null);
      }
      break;
    }

    default:
      return NextResponse.json({ ok: true, event: parsed.event, note: 'ignored' });
  }

  return NextResponse.json({
    ok: true,
    event: parsed.event,
    call_id: parsed.retellCallId,
    session_id: session?.id ?? null,
  });
}
