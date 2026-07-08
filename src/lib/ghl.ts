import { computeCallOutcome, ghlTagForOutcome } from './disposition';
import { getDb, markSyncedToGhl, type CallSession } from './db';

const GHL_BASE = () => process.env.GHL_BASE_URL ?? 'https://services.leadconnectorhq.com';
const GHL_VERSION = () => process.env.GHL_VERSION ?? '2021-07-28';

function ghlHeaders() {
  const key = process.env.GHL_API_KEY;
  if (!key) throw new Error('GHL_API_KEY is not set');
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Version: GHL_VERSION(),
  };
}

export async function syncCallToGhl(session: CallSession & Record<string, unknown>) {
  if (!session.ghl_contact_id) return { skipped: true, reason: 'no_contact_id' };
  if (session.synced_to_ghl_at) return { skipped: true, reason: 'already_synced' };
  if (session.call_outcome === 'pending') return { skipped: true, reason: 'outcome_pending' };

  const tag = ghlTagForOutcome(
    session.call_outcome,
    (session.wrap_up_code as string) ?? (session.outbound_phone_code as string)
  );

  const contactId = session.ghl_contact_id as string;

  if (tag) {
    await fetch(`${GHL_BASE()}/contacts/${contactId}/tags`, {
      method: 'POST',
      headers: ghlHeaders(),
      body: JSON.stringify({ tags: [tag] }),
    });
  }

  await fetch(`${GHL_BASE()}/contacts/${contactId}`, {
    method: 'PUT',
    headers: ghlHeaders(),
    body: JSON.stringify({
      customFields: [
        { key: 'last_disposition', field_value: tag ?? session.call_outcome },
        { key: 'last_call_source', field_value: session.source ?? 'tracker' },
      ],
    }),
  });

  const note = [
    `Call outcome: ${session.call_outcome}`,
    session.wrap_up_code ? `Wrap-up: ${session.wrap_up_code}` : null,
    session.agent_notes_8x8 ? `Agent notes: ${session.agent_notes_8x8}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  if (note) {
    await fetch(`${GHL_BASE()}/contacts/${contactId}/notes`, {
      method: 'POST',
      headers: ghlHeaders(),
      body: JSON.stringify({ body: note }),
    }).catch(() => null);
  }

  await markSyncedToGhl(session.id as string);
  return { ok: true, tag };
}

export async function syncPendingCallsToGhl(limit = 20) {
  const db = getDb();
  const rows = await db`
    SELECT * FROM call_sessions
    WHERE call_outcome != 'pending'
      AND synced_to_ghl_at IS NULL
      AND ghl_contact_id IS NOT NULL
    ORDER BY updated_at ASC
    LIMIT ${limit}
  `;

  const results = [];
  for (const row of rows) {
    try {
      results.push(await syncCallToGhl(row as CallSession & Record<string, unknown>));
    } catch (err) {
      results.push({ error: String(err), id: row.id });
    }
  }
  return results;
}

export { computeCallOutcome };
