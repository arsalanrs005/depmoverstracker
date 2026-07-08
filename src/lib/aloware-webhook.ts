import { normalizePhone } from './cdr-parser';
import { mapAlowareDispositionId } from './tracks';

export type AlowareWebhookPayload = {
  event?: string;
  body?: Record<string, unknown>;
};

function str(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export type ParsedAlowareCall = {
  event: string;
  communicationId: string;
  phone: string;
  leadName: string | null;
  ghlContactId: string | null;
  alowareContactId: string | null;
  alowareUserId: string | null;
  alowareUserName: string | null;
  alowareDispositionId: string | null;
  dispositionLabel: string | null;
  direction: 'inbound' | 'outbound';
  durationSec: number | null;
  talkTimeSec: number | null;
  notes: string | null;
  startedAt: Date | null;
  endedAt: Date | null;
  dispositionCode: string | null;
  callOutcome: 'good' | 'bad' | 'neutral' | 'pending';
  isAbandoned: boolean;
};

export function parseAlowareWebhook(raw: unknown): ParsedAlowareCall | null {
  const root = raw as AlowareWebhookPayload;
  const event = str(root.event);
  const b = (root.body ?? raw) as Record<string, unknown>;
  if (!b || typeof b !== 'object') return null;

  const communicationId = str(b.id);
  if (!communicationId) return null;

  const contact = (b.contact ?? {}) as Record<string, unknown>;
  const phoneRaw = str(b.lead_number) || str(contact.phone_number);
  const phone = normalizePhone(phoneRaw);
  if (!phone || phone.length < 10) return null;

  const dirNum = str(b.direction);
  const direction: 'inbound' | 'outbound' = dirNum === '1' || event.toLowerCase().includes('inbound')
    ? 'inbound'
    : 'outbound';

  const dispositionStatus = str(b.disposition_status).toLowerCase();
  const isAbandoned = dispositionStatus === 'abandoned' || event.includes('Abandoned');

  const alowareDispositionId =
    str(b.call_disposition_id) || str(contact.disposition_status_id) || null;

  const mapped = mapAlowareDispositionId(alowareDispositionId);
  const dispositionLabel = str(b.call_disposition) || str(contact.disposition_status) || null;

  let dispositionCode = mapped?.code ?? null;
  let callOutcome: 'good' | 'bad' | 'neutral' | 'pending' = mapped?.outcome ?? 'pending';

  if (isAbandoned && !dispositionCode) {
    callOutcome = 'bad';
  }

  const firstName = str(contact.first_name);
  const lastName = str(contact.last_name);
  const leadName = [firstName, lastName].filter(Boolean).join(' ') || str(contact.name) || null;

  const csfGhl = str(contact.csf_ghl_contact_id) || str(contact.external_data);

  return {
    event,
    communicationId,
    phone,
    leadName,
    ghlContactId: csfGhl || null,
    alowareContactId: str(contact.id) || str(b.contact_id) || null,
    alowareUserId: str(b.user_id) || str(b.owner_id) || str(contact.user_id) || null,
    alowareUserName: null,
    alowareDispositionId,
    dispositionLabel,
    direction,
    durationSec: num(b.duration),
    talkTimeSec: num(b.talk_time),
    notes: str(b.notes) || null,
    startedAt: parseAloDate(str(b.created_at)),
    endedAt: parseAloDate(str(b.updated_at)),
    dispositionCode,
    callOutcome,
    isAbandoned,
  };
}

function parseAloDate(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s.replace(' ', 'T') + 'Z');
  if (!Number.isNaN(d.getTime())) return d;
  const d2 = new Date(s);
  return Number.isNaN(d2.getTime()) ? null : d2;
}

export function isAlowareCallDisposedEvent(event: string): boolean {
  const e = event.toLowerCase();
  return e.includes('disposition') && (e.includes('call') || e.includes('phone'));
}
