import type { CallOutcome } from './db';

const GOOD_CODES = new Set([
  'connected / quoted',
  'connected',
  'quoted',
  'connected-quoted',
]);

const BAD_CODES = new Set([
  'no answer',
  'voicemail left',
  'voicemail',
  'wrong number',
  'do not call',
  'dnc',
]);

const NEUTRAL_CODES = new Set(['callback scheduled', 'callback']);

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
  if (c.includes('connected') || c.includes('quoted')) return 'disp-connected';
  if (c.includes('no answer')) return 'disp-no-answer';
  if (c.includes('voicemail')) return 'disp-voicemail';
  if (c.includes('wrong')) return 'disp-wrong-number';
  if (c.includes('dnc') || c.includes('do not call')) return 'disp-dnc';
  if (c.includes('callback')) return 'disp-callback';
  if (outcome === 'good') return 'disp-connected';
  if (outcome === 'bad') return 'disp-no-answer';
  return null;
}
