import { inferTrackFrom8x8, type X8xCdrTrack } from './tracks';

export type CdrRow = {
  callId: string;
  startTime: Date | null;
  answeredTime: Date | null;
  stopTime: Date | null;
  direction: 'Incoming' | 'Outgoing' | string;
  talkTimeSec: number;
  callTimeSec: number;
  caller: string;
  callee: string;
  callerName: string;
  calleeName: string;
  ringDurationSec: number;
  answered: string;
  missed: string;
  abandoned: string;
};

export type ParsedCdrCall = {
  x8xInteractionId: string;
  source: '8x8_inbound' | '8x8_outbound';
  track: X8xCdrTrack;
  phone: string;
  agentId8x8: string | null;
  agentName: string | null;
  leadName: string | null;
  queueName: string | null;
  startedAt: Date | null;
  endedAt: Date | null;
  durationSec: number;
  cdrDirection: string;
  cdrAnswered: string;
  cdrMissed: string;
  cdrAbandoned: string;
  callOutcome: 'good' | 'bad' | 'neutral' | 'pending';
  needsDisposition: boolean;
  hangupReason: string | null;
};

const EXTENSION_RE = /^\d{3,4}$/;

export function normalizePhone(raw: string): string {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return digits;
}

function isExtension(val: string): boolean {
  const t = (val ?? '').trim().toLowerCase();
  if (t.includes('ringgroup') || t.includes('callqueue') || t === 'callqueue') return false;
  return EXTENSION_RE.test((val ?? '').trim());
}

function isLeadPhone(val: string): boolean {
  const digits = (val ?? '').replace(/\D/g, '');
  return digits.length >= 10;
}

function parseDuration(s: string): number {
  const t = (s ?? '').trim();
  if (!t || t === '-' || t === 'N/A') return 0;
  const parts = t.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

function parseDateTime(s: string): Date | null {
  const t = (s ?? '').trim();
  if (!t || t === 'N/A' || t === '-') return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Parse CSV text (handles quoted fields with commas). */
export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    if (cols.length === 0) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (cols[idx] ?? '').trim();
    });
    rows.push(row);
  }
  return rows;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

function mapRawRow(raw: Record<string, string>): CdrRow {
  return {
    callId: raw['Call ID'] ?? raw['call_id'] ?? '',
    startTime: parseDateTime(raw['Start Time'] ?? ''),
    answeredTime: parseDateTime(raw['Answered Time'] ?? ''),
    stopTime: parseDateTime(raw['Stop Time'] ?? ''),
    direction: raw['Direction'] ?? '',
    talkTimeSec: parseDuration(raw['Talk Time'] ?? ''),
    callTimeSec: parseDuration(raw['Call Time'] ?? ''),
    caller: raw['Caller'] ?? '',
    callee: raw['Callee'] ?? '',
    callerName: raw['Caller Name'] ?? '',
    calleeName: raw['Callee Name'] ?? '',
    ringDurationSec: parseDuration(raw['Ring Duration'] ?? ''),
    answered: raw['Answered'] ?? '',
    missed: raw['Missed'] ?? '',
    abandoned: raw['Abandoned'] ?? '',
  };
}

export function transformCdrRow(row: CdrRow): ParsedCdrCall | null {
  if (!row.callId) return null;

  const dir = row.direction.toLowerCase();
  const isIncoming = dir === 'incoming';
  const source: '8x8_inbound' | '8x8_outbound' = isIncoming ? '8x8_inbound' : '8x8_outbound';

  let phone = '';
  let agentId8x8: string | null = null;
  let agentName: string | null = null;
  let leadName: string | null = null;
  let queueName: string | null = null;

  if (isIncoming) {
    if (isLeadPhone(row.caller)) {
      phone = normalizePhone(row.caller);
      leadName = row.callerName && row.callerName !== 'N/A' ? row.callerName : null;
    }
    if (isExtension(row.callee) && !row.callee.toLowerCase().includes('ringgroup')) {
      agentId8x8 = row.callee.trim();
      agentName = row.calleeName && row.calleeName !== 'N/A' ? row.calleeName : null;
    } else if (row.callee.toLowerCase().includes('ringgroup') || row.callee.toLowerCase().includes('callqueue')) {
      queueName = row.calleeName && row.calleeName !== 'N/A' ? row.calleeName : row.callee;
    }
  } else {
    if (isExtension(row.caller)) {
      agentId8x8 = row.caller.trim();
      agentName = row.callerName && row.callerName !== 'N/A' ? row.callerName : null;
    }
    if (isLeadPhone(row.callee)) {
      phone = normalizePhone(row.callee);
      leadName = row.calleeName && row.calleeName !== 'N/A' ? row.calleeName : null;
    }
  }

  if (!phone) {
    if (isLeadPhone(row.caller)) phone = normalizePhone(row.caller);
    else if (isLeadPhone(row.callee)) phone = normalizePhone(row.callee);
  }

  if (!phone) return null;

  const isAnswered = row.answered.toLowerCase() === 'answered';
  const isMissed = row.missed === '-' ? false : row.missed.toLowerCase() !== '' && row.missed !== '-';
  const isAbandoned = row.abandoned === '-' ? false : row.abandoned.toLowerCase() !== '' && row.abandoned !== '-';

  let callOutcome: ParsedCdrCall['callOutcome'] = 'pending';
  let hangupReason: string | null = null;

  if (isMissed || isAbandoned) {
    callOutcome = 'bad';
    hangupReason = isAbandoned ? 'abandoned' : 'missed';
  } else if (isAnswered) {
    callOutcome = 'pending';
  }

  const needsDisposition = isAnswered && !isExtension(phone);

  const track = inferTrackFrom8x8({
    queueName,
    agentId8x8,
    caller: row.caller,
    callee: row.callee,
  });

  return {
    x8xInteractionId: row.callId,
    source,
    track,
    phone,
    agentId8x8,
    agentName,
    leadName,
    queueName,
    startedAt: row.startTime,
    endedAt: row.stopTime,
    durationSec: row.talkTimeSec || row.callTimeSec,
    cdrDirection: row.direction,
    cdrAnswered: row.answered,
    cdrMissed: row.missed,
    cdrAbandoned: row.abandoned,
    callOutcome,
    needsDisposition,
    hangupReason,
  };
}

export function parseCdrCsv(text: string): ParsedCdrCall[] {
  const rawRows = parseCsv(text);
  const results: ParsedCdrCall[] = [];
  for (const raw of rawRows) {
    const parsed = transformCdrRow(mapRawRow(raw));
    if (parsed) results.push(parsed);
  }
  return results;
}

export const DISPOSITION_OPTIONS = [
  { code: 'connected-quoted', label: 'Quoted', tag: 'disp-quoted', outcome: 'good' as const },
  { code: 'callback-scheduled', label: 'Callback Requested', tag: 'disp-callback-requested', outcome: 'neutral' as const },
  { code: 'voicemail-left', label: 'Voicemail Left', tag: 'disp-voicemail-left', outcome: 'bad' as const },
  { code: 'no-answer', label: 'No Answer', tag: 'disp-no-answer', outcome: 'bad' as const },
  { code: 'not-interested', label: 'Connected - Not Interested', tag: 'disp-connected-not-interested', outcome: 'bad' as const },
  { code: 'dnc', label: 'Do Not Call', tag: 'disp-dnc', outcome: 'bad' as const },
  { code: 'wrong-number', label: 'Wrong Number', tag: 'disp-wrong-number', outcome: 'bad' as const },
] as const;

export type DispositionCode = (typeof DISPOSITION_OPTIONS)[number]['code'];
