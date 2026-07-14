import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { listQuoteEntryCalls, updateQuoteDetails } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const user = await getServerSession();
  if (!user || (user.role !== 'executive' && user.role !== 'admin')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  try {
    const calls = await listQuoteEntryCalls(100);
    return NextResponse.json({ calls });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const user = await getServerSession();
  if (!user || (user.role !== 'executive' && user.role !== 'admin')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  try {
    const body = await request.json();
    const callId = String(body.callId ?? '');
    const quoteType = body.quoteType === 'booked' ? 'booked' : 'quoted';
    const jobValue = Number(body.jobValue);
    if (!callId) {
      return NextResponse.json({ error: 'callId required' }, { status: 400 });
    }
    if (!Number.isFinite(jobValue) || jobValue <= 0) {
      return NextResponse.json({ error: 'Valid job value required' }, { status: 400 });
    }

    const jobValueCents = Math.round(jobValue * 100);
    const updated = await updateQuoteDetails({
      callId,
      quoteType,
      jobValueCents,
      moveDate: body.moveDate || null,
      originCity: body.originCity || null,
      destinationCity: body.destinationCity || null,
      enteredBy: body.enteredBy || user.email,
    });

    if (!updated) {
      return NextResponse.json({ error: 'Call not found or not Aloware' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, call: updated });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
