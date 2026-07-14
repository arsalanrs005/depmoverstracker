import {
  ALOWARE_DISPOSITION_ID_MAP,
  getAlowareDispositionByCode,
  resolveAlowareDisposition,
} from './aloware-dispositions';

/**
 * Call routing tracks for dual-stack: Aloware closers vs 8x8 legs.
 */

export type CallTrack =
  | 'aloware_closer'
  | '8x8_closer'
  | 'verification'
  | 'cs'
  | 'retell';

/** Tracks assigned from 8x8 CDR import / Work API sync */
export type X8xCdrTrack = '8x8_closer' | 'verification' | 'cs';

export const TRACK_LABELS: Record<CallTrack, string> = {
  aloware_closer: 'Aloware Closers',
  '8x8_closer': '8x8 Closers',
  verification: 'Verification',
  cs: 'Customer Success',
  retell: 'Retell AI',
};

/** Short labels for compact scrollable tab bar */
export const TRACK_TAB_LABELS: Record<CallTrack | 'all', string> = {
  all: 'All',
  aloware_closer: 'Aloware',
  '8x8_closer': '8x8',
  verification: 'Verify',
  cs: 'CS',
  retell: 'Retell',
};

export const TRACK_ORDER: CallTrack[] = [
  'aloware_closer',
  '8x8_closer',
  'verification',
  'cs',
  'retell',
];

/** @deprecated Prefer resolveAlowareDisposition — kept for older ID lookups */
export const ALOWARE_DISPOSITION_MAP: Record<
  string,
  { code: string; outcome: 'good' | 'bad' | 'neutral' }
> = Object.fromEntries(
  Object.entries(ALOWARE_DISPOSITION_ID_MAP).map(([id, code]) => {
    const d = getAlowareDispositionByCode(code);
    return [id, { code, outcome: d?.outcome ?? 'neutral' }];
  })
);

const VERIFICATION_HINTS = ['1014', 'verif', 'verification', '6282075195', '628-207-5195'];
const CS_HINTS = ['1013', 'customer success', '6282075194', '628-207-5194', ' cs '];
const CLOSER_RG_HINTS = ['1026', 'closer', '2064568026', '206-456-8026'];

function haystack(...parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ').toLowerCase();
}

/** Classify 8x8 CDR rows into manager tracks. */
export function inferTrackFrom8x8(params: {
  queueName?: string | null;
  agentId8x8?: string | null;
  caller?: string | null;
  callee?: string | null;
}): X8xCdrTrack {
  const text = haystack(params.queueName, params.caller, params.callee, params.agentId8x8);

  if (VERIFICATION_HINTS.some((h) => text.includes(h))) return 'verification';
  if (CS_HINTS.some((h) => text.includes(h))) return 'cs';
  if (CLOSER_RG_HINTS.some((h) => text.includes(h))) return '8x8_closer';

  // Default human 8x8 legs → junior closers queue (manager disposition)
  return '8x8_closer';
}

export function mapAlowareDispositionId(
  id: string | number | null | undefined
): { code: string; outcome: 'good' | 'bad' | 'neutral' } | null {
  const resolved = resolveAlowareDisposition({ dispositionId: id });
  if (!resolved) return null;
  return { code: resolved.code, outcome: resolved.outcome };
}

export function isValidTrack(t: string): t is CallTrack {
  return TRACK_ORDER.includes(t as CallTrack);
}
