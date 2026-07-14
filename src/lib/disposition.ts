import type { CallOutcome } from './db';

const GOOD_CODES = new Set([
  'connected / quoted',
  'connected',
  'quoted',
  'connected-quoted',
  'booked - deposit collected',
  'booked-deposit-collected',
  'booked - deposit pending',
  'booked-deposit-pending',
  'closed deal',
  'closed-deal',
  'connected - interested',
  'connected-interested',
]);

const BAD_CODES = new Set([
  'no answer',
  'no-answer',
  'voicemail left',
  'voicemail-left',
  'voicemail',
  'wrong number',
  'wrong-number',
  'do not call',
  'do-not-call',
  'dnc',
  'connected - not interested',
  'connected-not-interested',
  'not-interested',
]);

const NEUTRAL_CODES = new Set([
  'callback scheduled',
  'callback requested',
  'callback-requested',
  'callback-scheduled',
  'callback',
  'connected - objection',
  'connected-objection',
  'customer support',
  'customer-support',
  'transfer to closer',
  'transfer-to-closer',
]);

function normalizeCode(code: string | null | undefined): string {
  return (code ?? '').trim().toLowerCase();
}

export function outcomeFromWrapUpCode(wrapUpCode: string | null | undefined): CallOutcome {
  const c = normalizeCode(wrapUpCode);
  if (!c) return 'pending';
  if (GOOD_CODES.has(c)) return 'good';
  if (BAD_CODES.has(c)) return 'bad';
  if (NEUTRAL_CODES.has(c)) return 'neutral';
  return 'pending';
}

export function outcomeFromHangupReason(reason: string | null | undefined): CallOutcome {
  const r = normalizeCode(reason);
  if (!r) return 'pending';
  if (r.includes('noanswer') || r.includes('busy')) return 'bad';
  if (r.includes('normal')) return 'neutral';
  return 'pending';
}

export function computeCallOutcome(input: {
  wrapUpCode?: string | null;
  outboundPhoneCode?: string | null;
  hangupReason?: string | null;
  retellOutcome?: string | null;
}): CallOutcome {
  const fromWrap = outcomeFromWrapUpCode(input.wrapUpCode ?? input.outboundPhoneCode);
  if (fromWrap !== 'pending') return fromWrap;

  const retell = normalizeCode(input.retellOutcome);
  if (retell.includes('booked') || retell.includes('qualified')) return 'good';
  if (retell.includes('dnc') || retell.includes('wrong')) return 'bad';

  return outcomeFromHangupReason(input.hangupReason);
}

export function ghlTagForOutcome(outcome: CallOutcome, wrapUpCode?: string | null): string | null {
  const c = normalizeCode(wrapUpCode);
  if (c.includes('deposit collected') || c.includes('booked-deposit-collected')) {
    return 'disp-booked-deposit-collected';
  }
  if (c.includes('deposit pending') || c.includes('booked-deposit-pending')) {
    return 'disp-booked-deposit-pending';
  }
  if (c.includes('quoted')) return 'disp-quoted';
  if (c.includes('interested') && !c.includes('not')) return 'disp-connected-interested';
  if (c.includes('not interested')) return 'disp-connected-not-interested';
  if (c.includes('objection')) return 'disp-connected-objection';
  if (c.includes('no answer')) return 'disp-no-answer';
  if (c.includes('voicemail')) return 'disp-voicemail-left';
  if (c.includes('wrong')) return 'disp-wrong-number';
  if (c.includes('dnc') || c.includes('do not call')) return 'disp-dnc';
  if (c.includes('callback')) return 'disp-callback-requested';
  if (c.includes('transfer')) return 'disp-transfer-to-closer';
  if (c.includes('customer support')) return 'disp-customer-support';
  if (c.includes('closed')) return 'disp-closed-deal';
  if (outcome === 'good') return 'disp-quoted';
  if (outcome === 'bad') return 'disp-no-answer';
  return null;
}
