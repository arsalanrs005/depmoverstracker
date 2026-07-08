/**
 * 8x8 Historical Analytics sync (T2 stub).
 * Fill X8X_ANALYTICS_* env vars and implement OAuth + detailed-reports poll.
 * @see docs/CALL-TRACKER-START-HERE.md § T2
 */

import { getDb } from './db';
import { computeCallOutcome } from './disposition';

export type AnalyticsInteraction = {
  interactionId: string;
  transactionId?: string;
  phone: string;
  wrapUpCodeText?: string;
  outboundPhoneCodeText?: string;
  agentNotes?: string;
  recordingFileNames?: string;
  campaignId?: string;
  queueName?: string;
  agentName?: string;
  agentId?: string;
  hangupReason?: string;
  startedAt?: string;
  endedAt?: string;
};

export async function fetchRecent8x8Interactions(_sinceMinutes = 15): Promise<AnalyticsInteraction[]> {
  const apiKey = process.env.X8X_ANALYTICS_API_KEY;
  if (!apiKey) {
    return [];
  }

  // TODO: OAuth token → POST detailed-reports-interaction-details
  // https://developer.8x8.com/analytics/docs/cc-historical-analytics-detailed-report/
  return [];
}

export async function merge8x8Interaction(row: AnalyticsInteraction) {
  const db = getDb();
  const phone = row.phone;
  const outcome = computeCallOutcome({
    wrapUpCode: row.wrapUpCodeText,
    outboundPhoneCode: row.outboundPhoneCodeText,
    hangupReason: row.hangupReason,
  });

  const recordingFiles = row.recordingFileNames
    ? row.recordingFileNames.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  // Match open Retell session by phone within 2h window, else insert 8x8-only row
  const matched = await db`
    SELECT id FROM call_sessions
    WHERE phone = ${phone}
      AND x8x_interaction_id IS NULL
      AND created_at > now() - interval '2 hours'
    ORDER BY created_at DESC
    LIMIT 1
  `;

  if (matched[0]) {
    await db`
      UPDATE call_sessions SET
        x8x_interaction_id = ${row.interactionId},
        x8x_transaction_id = ${row.transactionId ?? null},
        x8x_campaign_id = ${row.campaignId ?? null},
        queue_name = ${row.queueName ?? null},
        agent_name = ${row.agentName ?? null},
        agent_id_8x8 = ${row.agentId ?? null},
        wrap_up_code = ${row.wrapUpCodeText ?? null},
        outbound_phone_code = ${row.outboundPhoneCodeText ?? null},
        agent_notes_8x8 = ${row.agentNotes ?? null},
        recording_files = ${db.json(recordingFiles)},
        call_outcome = ${outcome},
        updated_at = now()
      WHERE id = ${matched[0].id}
    `;
    return { merged: true, id: matched[0].id };
  }

  const inserted = await db`
    INSERT INTO call_sessions (
      phone, source, status, x8x_interaction_id, x8x_transaction_id,
      x8x_campaign_id, queue_name, agent_name, agent_id_8x8,
      wrap_up_code, outbound_phone_code, agent_notes_8x8,
      recording_files, call_outcome, started_at, ended_at
    ) VALUES (
      ${phone}, '8x8_outbound', 'completed', ${row.interactionId},
      ${row.transactionId ?? null}, ${row.campaignId ?? null},
      ${row.queueName ?? null}, ${row.agentName ?? null}, ${row.agentId ?? null},
      ${row.wrapUpCodeText ?? null}, ${row.outboundPhoneCodeText ?? null},
      ${row.agentNotes ?? null}, ${db.json(recordingFiles)}, ${outcome},
      ${row.startedAt ? new Date(row.startedAt) : null},
      ${row.endedAt ? new Date(row.endedAt) : null}
    )
    RETURNING id
  `;
  return { merged: false, id: inserted[0]?.id };
}

export async function sync8x8Analytics() {
  const rows = await fetchRecent8x8Interactions(15);
  const results = [];
  for (const row of rows) {
    results.push(await merge8x8Interaction(row));
  }
  return { fetched: rows.length, results };
}
