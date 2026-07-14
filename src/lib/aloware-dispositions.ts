/**
 * Canonical Aloware closer dispositions — exact labels as configured in Aloware.
 */

export type CallOutcomeKind = 'good' | 'bad' | 'neutral';

export type AlowareDisposition = {
  /** Stable app code stored on call_sessions.disposition_code */
  code: string;
  /** Exact Aloware label */
  label: string;
  outcome: CallOutcomeKind;
  ghlTag: string;
  /** Quote-tracking bucket (null = not a quote KPI disposition) */
  quoteType: 'quoted' | 'booked_pending' | 'booked' | null;
};

export const ALOWARE_DISPOSITIONS: readonly AlowareDisposition[] = [
  {
    code: 'booked-deposit-collected',
    label: 'Booked - Deposit Collected',
    outcome: 'good',
    ghlTag: 'disp-booked-deposit-collected',
    quoteType: 'booked',
  },
  {
    code: 'booked-deposit-pending',
    label: 'Booked - Deposit Pending',
    outcome: 'good',
    ghlTag: 'disp-booked-deposit-pending',
    quoteType: 'booked_pending',
  },
  {
    code: 'callback-requested',
    label: 'Callback Requested',
    outcome: 'neutral',
    ghlTag: 'disp-callback-requested',
    quoteType: null,
  },
  {
    code: 'closed-deal',
    label: 'Closed deal',
    outcome: 'good',
    ghlTag: 'disp-closed-deal',
    quoteType: 'booked',
  },
  {
    code: 'connected-interested',
    label: 'Connected - Interested',
    outcome: 'good',
    ghlTag: 'disp-connected-interested',
    quoteType: null,
  },
  {
    code: 'connected-not-interested',
    label: 'Connected - Not Interested',
    outcome: 'bad',
    ghlTag: 'disp-connected-not-interested',
    quoteType: null,
  },
  {
    code: 'connected-objection',
    label: 'Connected - Objection',
    outcome: 'neutral',
    ghlTag: 'disp-connected-objection',
    quoteType: null,
  },
  {
    code: 'customer-support',
    label: 'Customer Support',
    outcome: 'neutral',
    ghlTag: 'disp-customer-support',
    quoteType: null,
  },
  {
    code: 'do-not-call',
    label: 'Do Not Call',
    outcome: 'bad',
    ghlTag: 'disp-dnc',
    quoteType: null,
  },
  {
    code: 'no-answer',
    label: 'No Answer',
    outcome: 'bad',
    ghlTag: 'disp-no-answer',
    quoteType: null,
  },
  {
    code: 'quoted',
    label: 'Quoted',
    outcome: 'good',
    ghlTag: 'disp-quoted',
    quoteType: 'quoted',
  },
  {
    code: 'transfer-to-closer',
    label: 'Transfer To Closer',
    outcome: 'neutral',
    ghlTag: 'disp-transfer-to-closer',
    quoteType: null,
  },
  {
    code: 'voicemail-left',
    label: 'Voicemail Left',
    outcome: 'bad',
    ghlTag: 'disp-voicemail-left',
    quoteType: null,
  },
  {
    code: 'wrong-number',
    label: 'Wrong Number',
    outcome: 'bad',
    ghlTag: 'disp-wrong-number',
    quoteType: null,
  },
] as const;

/** Aloware disposition IDs previously captured / known. Prefer label match when unsure. */
export const ALOWARE_DISPOSITION_ID_MAP: Record<string, string> = {
  // Legacy IDs — remap onto current codes when label is missing
  '29003': 'quoted',
  '29004': 'quoted',
  '29005': 'connected-not-interested',
  '29006': 'voicemail-left',
  '29007': 'no-answer',
  '29008': 'connected-not-interested',
  '29009': 'callback-requested',
  '29010': 'do-not-call',
  '29011': 'booked-deposit-pending',
  '29012': 'booked-deposit-collected',
};

const byCode = new Map(ALOWARE_DISPOSITIONS.map((d) => [d.code, d]));

function normalizeLabel(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ');
}

const byLabel = new Map(
  ALOWARE_DISPOSITIONS.map((d) => [normalizeLabel(d.label), d])
);

/** Extra loose aliases for webhook variance / legacy values */
const LABEL_ALIASES: Record<string, string> = {
  quoted: 'quoted',
  'connected - quoted': 'quoted',
  'connected — quoted': 'quoted',
  'connected / quoted': 'quoted',
  'connected-quoted': 'quoted',
  'booked - deposit collected': 'booked-deposit-collected',
  'booked-deposit-collected': 'booked-deposit-collected',
  'deposit collected': 'booked-deposit-collected',
  'booked - deposit pending': 'booked-deposit-pending',
  'booked-deposit-pending': 'booked-deposit-pending',
  'deposit pending': 'booked-deposit-pending',
  'callback requested': 'callback-requested',
  'callback scheduled': 'callback-requested',
  'callback-scheduled': 'callback-requested',
  'closed deal': 'closed-deal',
  'connected - interested': 'connected-interested',
  'connected - not interested': 'connected-not-interested',
  'not interested': 'connected-not-interested',
  'connected - objection': 'connected-objection',
  'customer support': 'customer-support',
  'do not call': 'do-not-call',
  dnc: 'do-not-call',
  'no answer': 'no-answer',
  'transfer to closer': 'transfer-to-closer',
  'voicemail left': 'voicemail-left',
  voicemail: 'voicemail-left',
  'wrong number': 'wrong-number',
};

export function getAlowareDispositionByCode(code: string | null | undefined): AlowareDisposition | null {
  if (!code) return null;
  return byCode.get(code) ?? null;
}

export function resolveAlowareDisposition(params: {
  dispositionId?: string | number | null;
  dispositionLabel?: string | null;
}): AlowareDisposition | null {
  const labelRaw = params.dispositionLabel?.trim() ?? '';
  if (labelRaw) {
    const key = normalizeLabel(labelRaw);
    const direct = byLabel.get(key);
    if (direct) return direct;
    const aliasCode = LABEL_ALIASES[key];
    if (aliasCode) return byCode.get(aliasCode) ?? null;
  }

  if (params.dispositionId != null && params.dispositionId !== '') {
    const code = ALOWARE_DISPOSITION_ID_MAP[String(params.dispositionId)];
    if (code) return byCode.get(code) ?? null;
  }

  return null;
}

export function isQuoteTrackingDisposition(code: string | null | undefined): boolean {
  const d = getAlowareDispositionByCode(code);
  return d?.quoteType != null;
}

/** Codes that count toward Quotes Sent */
export const QUOTE_SENT_CODES = new Set(['quoted', 'connected-quoted']);

/** Codes that count toward Deposit Pending */
export const DEPOSIT_PENDING_CODES = new Set(['booked-deposit-pending']);

/** Codes that count toward Deposit Collected */
export const DEPOSIT_COLLECTED_CODES = new Set(['booked-deposit-collected', 'closed-deal']);
