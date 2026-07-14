import postgres from 'postgres';
import type { ParsedCdrCall } from './cdr-parser';
import { findGhlContactByPhone } from './ghl-lookup';
import type { ParsedAlowareCall } from './aloware-webhook';
import type { CallTrack } from './tracks';
import { isValidTrack } from './tracks';
import { normalizeTrackKpiRow, type TrackKpiRow } from './dashboard-kpis';
import { buildScoreboardPayload, getScoreboardWeek } from './scoreboard-week';
import type { QuoteTrackingPayload } from './quote-tracking';

let sql: ReturnType<typeof postgres> | null = null;

export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  if (!sql) sql = postgres(url, { prepare: false });
  return sql;
}

export type CallOutcome = 'good' | 'bad' | 'neutral' | 'pending';

export type CallSession = {
  id: string;
  ghl_contact_id: string | null;
  phone: string;
  source: string;
  status: string;
  retell_call_id: string | null;
  call_outcome: CallOutcome;
  created_at: Date;
};

export async function logWebhook(source: string, eventType: string, payload: unknown, externalId?: string) {
  const db = getDb();
  await db`
    INSERT INTO webhook_events (source, event_type, external_id, payload)
    VALUES (${source}, ${eventType}, ${externalId ?? null}, ${db.json(payload as never)})
  `;
}

export async function findCallByRetellId(retellCallId: string) {
  const db = getDb();
  const rows = await db`
    SELECT * FROM call_sessions WHERE retell_call_id = ${retellCallId} LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function findCallByX8xId(x8xId: string) {
  const db = getDb();
  const rows = await db`
    SELECT * FROM call_sessions WHERE x8x_interaction_id = ${x8xId} LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function upsertRetellCallStarted(params: {
  retellCallId: string;
  phone: string;
  ghlContactId?: string;
  ghlOpportunityId?: string;
  retellAgentId?: string;
  startedAt?: string;
}) {
  const db = getDb();
  const existing = await findCallByRetellId(params.retellCallId);
  if (existing) return existing;

  const rows = await db`
    INSERT INTO call_sessions (
      phone, source, track, status, retell_call_id, retell_agent_id,
      ghl_contact_id, ghl_opportunity_id, started_at
    ) VALUES (
      ${params.phone},
      'retell',
      'retell',
      'ringing',
      ${params.retellCallId},
      ${params.retellAgentId ?? null},
      ${params.ghlContactId ?? null},
      ${params.ghlOpportunityId ?? null},
      ${params.startedAt ? new Date(params.startedAt) : new Date()}
    )
    RETURNING *
  `;
  return rows[0];
}

export async function updateRetellCallEnded(params: {
  retellCallId: string;
  endedAt?: string;
  durationSec?: number;
}) {
  const db = getDb();
  const rows = await db`
    UPDATE call_sessions SET
      status = 'completed',
      ended_at = ${params.endedAt ? new Date(params.endedAt) : new Date()},
      duration_sec = ${params.durationSec ?? null},
      updated_at = now()
    WHERE retell_call_id = ${params.retellCallId}
    RETURNING *
  `;
  return rows[0] ?? null;
}

export async function updateRetellCallAnalyzed(params: {
  retellCallId: string;
  transcript?: string;
  analysis?: Record<string, unknown>;
  callOutcome?: CallOutcome;
}) {
  const db = getDb();
  const rows = await db`
    UPDATE call_sessions SET
      retell_transcript = ${params.transcript ?? null},
      retell_analysis = ${params.analysis ? db.json(params.analysis as never) : null},
      call_outcome = COALESCE(${params.callOutcome ?? null}, call_outcome),
      updated_at = now()
    WHERE retell_call_id = ${params.retellCallId}
    RETURNING *
  `;
  return rows[0] ?? null;
}

export async function listRecentCalls(limit = 50) {
  const db = getDb();
  return db`
    SELECT id, phone, source, track, status, call_outcome, retell_call_id, x8x_interaction_id,
           aloware_communication_id, ghl_contact_id, agent_name, agent_id_8x8,
           aloware_user_name, aloware_user_id, lead_name, disposition_code,
           disposition_source, needs_disposition, started_at, ended_at, duration_sec, cdr_direction,
           cdr_answered, cdr_missed, cdr_abandoned, created_at
    FROM call_sessions
    ORDER BY COALESCE(started_at, created_at) DESC
    LIMIT ${limit}
  `;
}

export async function getCallById(id: string) {
  const db = getDb();
  const rows = await db`SELECT * FROM call_sessions WHERE id = ${id} LIMIT 1`;
  return rows[0] ?? null;
}

export async function markSyncedToGhl(callSessionId: string) {
  const db = getDb();
  await db`
    UPDATE call_sessions SET synced_to_ghl_at = now(), updated_at = now()
    WHERE id = ${callSessionId}
  `;
}

export async function listAgents(filters?: { platform?: '8x8' | 'aloware'; team?: string }) {
  const db = getDb();
  if (filters?.platform && filters?.team) {
    return db`
      SELECT id, name, agent_id_8x8, agent_id_aloware, platform, ring_group, team
      FROM agents WHERE platform = ${filters.platform} AND team = ${filters.team}
      ORDER BY name
    `;
  }
  if (filters?.platform) {
    return db`
      SELECT id, name, agent_id_8x8, agent_id_aloware, platform, ring_group, team
      FROM agents WHERE platform = ${filters.platform}
      ORDER BY name
    `;
  }
  return db`
    SELECT id, name, agent_id_8x8, agent_id_aloware, platform, ring_group, team
    FROM agents ORDER BY platform, name
  `;
}

export async function importCdrRows(
  rows: ParsedCdrCall[],
  filename?: string,
  options?: { skipGhl?: boolean }
) {
  const db = getDb();
  let inserted = 0;
  let skipped = 0;
  const updated = 0;

  if (rows.length === 0) {
    return { inserted, skipped, updated, total: 0, importId: null };
  }

  const ids = rows.map((r) => r.x8xInteractionId);
  const existingRows = await db`
    SELECT x8x_interaction_id FROM call_sessions
    WHERE x8x_interaction_id = ANY(${ids})
  `;
  const existingSet = new Set(existingRows.map((r) => r.x8x_interaction_id as string));

  const agentRows = await db`SELECT agent_id_8x8, name FROM agents`;
  const agentMap = new Map(agentRows.map((a) => [a.agent_id_8x8 as string, a.name as string]));

  for (const row of rows) {
    if (existingSet.has(row.x8xInteractionId)) {
      skipped++;
      continue;
    }

    let ghlContactId: string | null = null;
    let ghlOpportunityId: string | null = null;
    if (!options?.skipGhl && process.env.GHL_API_KEY) {
      const match = await findGhlContactByPhone(row.phone);
      if (match) {
        ghlContactId = match.contactId;
        ghlOpportunityId = match.opportunityId;
        if (!row.leadName && (match.firstName || match.lastName)) {
          row.leadName = [match.firstName, match.lastName].filter(Boolean).join(' ') || null;
        }
      }
    }

    let agentName = row.agentName;
    const agentId = row.agentId8x8;
    if (agentId && !agentName) {
      agentName = agentMap.get(agentId) ?? null;
    }

    const insertedRows = await db`
      INSERT INTO call_sessions (
        phone, source, track, status, x8x_interaction_id,
        agent_id_8x8, agent_name, queue_name, lead_name,
        ghl_contact_id, ghl_opportunity_id,
        started_at, ended_at, duration_sec,
        cdr_direction, cdr_answered, cdr_missed, cdr_abandoned,
        call_outcome, needs_disposition, hangup_reason
      ) VALUES (
        ${row.phone}, ${row.source}, ${row.track}, 'completed', ${row.x8xInteractionId},
        ${agentId}, ${agentName}, ${row.queueName}, ${row.leadName},
        ${ghlContactId}, ${ghlOpportunityId},
        ${row.startedAt}, ${row.endedAt}, ${row.durationSec},
        ${row.cdrDirection}, ${row.cdrAnswered}, ${row.cdrMissed}, ${row.cdrAbandoned},
        ${row.callOutcome}, ${row.needsDisposition}, ${row.hangupReason}
      )
      ON CONFLICT (x8x_interaction_id) DO NOTHING
      RETURNING id
    `;
    if (insertedRows.length === 0) {
      skipped++;
      continue;
    }
    inserted++;
    existingSet.add(row.x8xInteractionId);
  }

  const importRow = await db`
    INSERT INTO cdr_imports (filename, rows_total, rows_inserted, rows_skipped, rows_updated)
    VALUES (${filename ?? null}, ${rows.length}, ${inserted}, ${skipped}, ${updated})
    RETURNING id
  `;

  return { inserted, skipped, updated, total: rows.length, importId: importRow[0]?.id };
}

export async function findCallByAlowareCommId(commId: string) {
  const db = getDb();
  const rows = await db`
    SELECT * FROM call_sessions WHERE aloware_communication_id = ${commId} LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function upsertAlowareCallDisposed(parsed: ParsedAlowareCall) {
  const db = getDb();
  const existing = await findCallByAlowareCommId(parsed.communicationId);

  const source = parsed.direction === 'inbound' ? 'aloware_inbound' : 'aloware_outbound';
  const hasDisposition = Boolean(parsed.dispositionCode);
  const needsDisposition = !hasDisposition && !parsed.isAbandoned;

  let agentName: string | null = parsed.alowareUserName;
  if (parsed.alowareUserId) {
    const agentRows = await db`
      SELECT name FROM agents WHERE agent_id_aloware = ${parsed.alowareUserId} LIMIT 1
    `;
    if (agentRows[0]?.name) agentName = agentRows[0].name as string;
  }

  if (existing) {
    const rows = await db`
      UPDATE call_sessions SET
        phone = ${parsed.phone},
        source = ${source},
        track = 'aloware_closer',
        status = 'completed',
        aloware_disposition_id = ${parsed.alowareDispositionId},
        aloware_user_id = ${parsed.alowareUserId},
        aloware_user_name = ${agentName},
        agent_name = COALESCE(${agentName}, agent_name),
        lead_name = COALESCE(${parsed.leadName}, lead_name),
        ghl_contact_id = COALESCE(${parsed.ghlContactId}, ghl_contact_id),
        started_at = COALESCE(${parsed.startedAt}, started_at),
        ended_at = COALESCE(${parsed.endedAt}, ended_at),
        duration_sec = COALESCE(${parsed.talkTimeSec ?? parsed.durationSec}, duration_sec),
        disposition_code = COALESCE(${parsed.dispositionCode}, disposition_code),
        wrap_up_code = COALESCE(${parsed.dispositionCode}, wrap_up_code),
        call_outcome = CASE
          WHEN ${parsed.dispositionCode} IS NOT NULL THEN ${parsed.callOutcome}
          ELSE call_outcome
        END,
        disposition_source = CASE
          WHEN ${parsed.dispositionCode} IS NOT NULL THEN 'aloware_agent'
          ELSE disposition_source
        END,
        needs_disposition = ${needsDisposition},
        disposition_submitted_at = CASE
          WHEN ${parsed.dispositionCode} IS NOT NULL THEN now()
          ELSE disposition_submitted_at
        END,
        agent_notes_app = COALESCE(${parsed.notes}, agent_notes_app),
        hangup_reason = CASE WHEN ${parsed.isAbandoned} THEN 'abandoned' ELSE hangup_reason END,
        updated_at = now()
      WHERE id = ${existing.id}
      RETURNING *
    `;
    return { session: rows[0], created: false };
  }

  const rows = await db`
    INSERT INTO call_sessions (
      phone, source, track, status,
      aloware_communication_id, aloware_disposition_id,
      aloware_user_id, aloware_user_name, agent_name,
      lead_name, ghl_contact_id,
      started_at, ended_at, duration_sec,
      disposition_code, wrap_up_code, call_outcome,
      disposition_source, needs_disposition,
      disposition_submitted_at, agent_notes_app, hangup_reason
    ) VALUES (
      ${parsed.phone}, ${source}, 'aloware_closer', 'completed',
      ${parsed.communicationId}, ${parsed.alowareDispositionId},
      ${parsed.alowareUserId}, ${agentName}, ${agentName},
      ${parsed.leadName}, ${parsed.ghlContactId},
      ${parsed.startedAt ?? new Date()}, ${parsed.endedAt ?? new Date()},
      ${parsed.talkTimeSec ?? parsed.durationSec},
      ${parsed.dispositionCode}, ${parsed.dispositionCode}, ${parsed.callOutcome},
      ${hasDisposition ? 'aloware_agent' : null},
      ${needsDisposition},
      ${hasDisposition ? new Date() : null},
      ${parsed.notes}, ${parsed.isAbandoned ? 'abandoned' : null}
    )
    RETURNING *
  `;
  return { session: rows[0], created: true };
}

export async function listPendingDispositions(filters?: {
  agentId8x8?: string;
  track?: CallTrack;
}) {
  const db = getDb();
  const track = filters?.track && isValidTrack(filters.track) ? filters.track : null;

  if (filters?.agentId8x8 && track) {
    return db`
      SELECT cs.* FROM call_sessions cs
      WHERE cs.needs_disposition = true
        AND cs.disposition_code IS NULL
        AND cs.track = ${track}
        AND cs.source IN ('8x8_inbound', '8x8_outbound')
        AND cs.agent_id_8x8 = ${filters.agentId8x8}
        AND cs.agent_id_8x8 IN (
          SELECT agent_id_8x8 FROM agents
          WHERE platform = '8x8' AND team = ${track === '8x8_closer' ? '8x8_closer' : track === 'verification' ? 'verification' : 'cs'}
        )
      ORDER BY cs.started_at DESC NULLS LAST
      LIMIT 100
    `;
  }
  if (track && track !== 'aloware_closer') {
    const team = track === '8x8_closer' ? '8x8_closer' : track;
    return db`
      SELECT cs.* FROM call_sessions cs
      WHERE cs.needs_disposition = true AND cs.disposition_code IS NULL
        AND cs.track = ${track}
        AND cs.source IN ('8x8_inbound', '8x8_outbound')
        AND (
          cs.agent_id_8x8 IS NULL
          OR cs.agent_id_8x8 IN (
            SELECT agent_id_8x8 FROM agents WHERE platform = '8x8' AND team = ${team}
          )
        )
      ORDER BY cs.started_at DESC NULLS LAST
      LIMIT 100
    `;
  }
  if (filters?.agentId8x8) {
    return db`
      SELECT cs.* FROM call_sessions cs
      WHERE cs.needs_disposition = true
        AND cs.disposition_code IS NULL
        AND cs.track IN ('8x8_closer', 'verification', 'cs')
        AND cs.source IN ('8x8_inbound', '8x8_outbound')
        AND cs.agent_id_8x8 = ${filters.agentId8x8}
        AND cs.agent_id_8x8 IN (SELECT agent_id_8x8 FROM agents WHERE platform = '8x8')
      ORDER BY cs.started_at DESC NULLS LAST
      LIMIT 100
    `;
  }
  return db`
    SELECT cs.* FROM call_sessions cs
    WHERE cs.needs_disposition = true AND cs.disposition_code IS NULL
      AND cs.track IN ('8x8_closer', 'verification', 'cs')
      AND cs.source IN ('8x8_inbound', '8x8_outbound')
      AND (
        cs.agent_id_8x8 IS NULL
        OR cs.agent_id_8x8 IN (SELECT agent_id_8x8 FROM agents WHERE platform = '8x8')
      )
    ORDER BY cs.started_at DESC NULLS LAST
    LIMIT 100
  `;
}

export async function submitDisposition(params: {
  callId: string;
  dispositionCode: string;
  callOutcome: CallOutcome;
  notes?: string;
  callbackAt?: string | null;
}) {
  const db = getDb();
  const rows = await db`
    UPDATE call_sessions SET
      disposition_code = ${params.dispositionCode},
      wrap_up_code = ${params.dispositionCode},
      call_outcome = ${params.callOutcome},
      agent_notes_app = ${params.notes ?? null},
      callback_at = ${params.callbackAt ? new Date(params.callbackAt) : null},
      needs_disposition = false,
      disposition_source = 'manager',
      disposition_submitted_at = now(),
      updated_at = now()
    WHERE id = ${params.callId}
    RETURNING *
  `;
  return rows[0] ?? null;
}

export type DashboardPeriod = 'day' | 'week' | 'month';

function periodInterval(period: DashboardPeriod): string {
  if (period === 'day') return '1 day';
  if (period === 'week') return '7 days';
  return '30 days';
}

export async function getDashboardStats(period: DashboardPeriod = 'day', trackFilter?: CallTrack) {
  const db = getDb();
  const interval = periodInterval(period);
  const track = trackFilter && isValidTrack(trackFilter) ? trackFilter : null;

  const trackKpiRows = await db`
    SELECT
      cs.track,
      COUNT(*) AS total_calls,
      COUNT(*) FILTER (WHERE cs.source IN ('8x8_inbound', 'aloware_inbound')) AS inbound_total,
      COUNT(*) FILTER (WHERE cs.source IN ('8x8_inbound', 'aloware_inbound') AND (
        cs.disposition_code IS NOT NULL
        OR cs.cdr_answered = 'Answered'
        OR (cs.duration_sec IS NOT NULL AND cs.duration_sec > 0)
      )) AS inbound_answered,
      COUNT(*) FILTER (WHERE cs.source IN ('8x8_inbound', 'aloware_inbound') AND (
        cs.cdr_missed != '-' OR cs.cdr_abandoned != '-'
        OR cs.hangup_reason IN ('missed', 'abandoned')
      ) AND cs.disposition_code IS NULL) AS inbound_missed_abandoned,
      COUNT(*) FILTER (WHERE cs.source IN ('8x8_outbound', 'aloware_outbound')) AS outbound_total,
      COUNT(*) FILTER (WHERE cs.needs_disposition = true AND cs.disposition_code IS NULL) AS pending_dispositions,
      COUNT(*) FILTER (WHERE cs.disposition_code IS NOT NULL) AS dispositions_submitted,
      COUNT(*) FILTER (WHERE cs.call_outcome = 'good') AS outcome_good,
      COUNT(*) FILTER (WHERE cs.call_outcome = 'bad') AS outcome_bad,
      COUNT(*) FILTER (WHERE cs.call_outcome = 'neutral') AS outcome_neutral
    FROM call_sessions cs
    WHERE COALESCE(cs.started_at, cs.created_at) >= now() - ${interval}::interval
      AND (
        (cs.track = 'aloware_closer' AND cs.source IN ('aloware_inbound', 'aloware_outbound')
          AND (cs.aloware_user_id IS NULL OR cs.aloware_user_id IN (
            SELECT agent_id_aloware FROM agents WHERE platform = 'aloware' AND team = 'inbound_closers'
          )))
        OR (cs.track = '8x8_closer' AND cs.source IN ('8x8_inbound', '8x8_outbound')
          AND (cs.agent_id_8x8 IS NULL OR cs.agent_id_8x8 IN (
            SELECT agent_id_8x8 FROM agents WHERE platform = '8x8' AND team = '8x8_closer'
          )))
        OR (cs.track = 'verification' AND cs.source IN ('8x8_inbound', '8x8_outbound')
          AND (cs.agent_id_8x8 IS NULL OR cs.agent_id_8x8 IN (
            SELECT agent_id_8x8 FROM agents WHERE platform = '8x8' AND team = 'verification'
          )))
        OR (cs.track = 'cs' AND cs.source IN ('8x8_inbound', '8x8_outbound')
          AND (cs.agent_id_8x8 IS NULL OR cs.agent_id_8x8 IN (
            SELECT agent_id_8x8 FROM agents WHERE platform = '8x8' AND team = 'cs'
          )))
        OR cs.track = 'retell'
      )
    GROUP BY cs.track
    ORDER BY total_calls DESC
  `;
  const trackKpis: TrackKpiRow[] = trackKpiRows.map((row) =>
    normalizeTrackKpiRow(row as Record<string, unknown>)
  );

  const kpiForTrack = track ? trackKpis.find((k) => k.track === track) ?? null : null;

  const [totals] = track && kpiForTrack
    ? [kpiForTrack as unknown as Record<string, unknown>]
    : track
      ? await db`
    SELECT
      COUNT(*) AS total_calls,
      COUNT(*) FILTER (WHERE source IN ('8x8_inbound', 'aloware_inbound')) AS inbound_total,
      COUNT(*) FILTER (WHERE source IN ('8x8_inbound', 'aloware_inbound') AND (
        disposition_code IS NOT NULL OR cdr_answered = 'Answered'
        OR (duration_sec IS NOT NULL AND duration_sec > 0)
      )) AS inbound_answered,
      COUNT(*) FILTER (WHERE source IN ('8x8_inbound', 'aloware_inbound') AND (
        cdr_missed != '-' OR cdr_abandoned != '-'
        OR hangup_reason IN ('missed', 'abandoned')
      ) AND disposition_code IS NULL) AS inbound_missed_abandoned,
      COUNT(*) FILTER (WHERE source IN ('8x8_outbound', 'aloware_outbound')) AS outbound_total,
      COUNT(*) FILTER (WHERE needs_disposition = true AND disposition_code IS NULL) AS pending_dispositions,
      COUNT(*) FILTER (WHERE disposition_code IS NOT NULL) AS dispositions_submitted,
      COUNT(*) FILTER (WHERE disposition_source = 'aloware_agent') AS aloware_agent_dispositions,
      COUNT(*) FILTER (WHERE disposition_source = 'manager') AS manager_dispositions,
      COUNT(*) FILTER (WHERE call_outcome = 'good') AS outcome_good,
      COUNT(*) FILTER (WHERE call_outcome = 'bad') AS outcome_bad,
      COUNT(*) FILTER (WHERE call_outcome = 'neutral') AS outcome_neutral
    FROM call_sessions
    WHERE COALESCE(started_at, created_at) >= now() - ${interval}::interval
      AND track = ${track}
  `
      : await db`
    SELECT
      COUNT(*) AS total_calls,
      COUNT(*) FILTER (WHERE track = 'aloware_closer') AS aloware_total,
      COUNT(*) FILTER (WHERE track = '8x8_closer') AS x8x_closer_total,
      COUNT(*) FILTER (WHERE track = 'verification') AS verification_total,
      COUNT(*) FILTER (WHERE track = 'cs') AS cs_total,
      COUNT(*) FILTER (WHERE track = 'retell') AS retell_total,
      COUNT(*) FILTER (WHERE source IN ('8x8_inbound', 'aloware_inbound')) AS inbound_total,
      COUNT(*) FILTER (WHERE source IN ('8x8_inbound', 'aloware_inbound') AND (
        disposition_code IS NOT NULL OR cdr_answered = 'Answered'
        OR (duration_sec IS NOT NULL AND duration_sec > 0)
      )) AS inbound_answered,
      COUNT(*) FILTER (WHERE source IN ('8x8_inbound', 'aloware_inbound') AND (
        cdr_missed != '-' OR cdr_abandoned != '-'
        OR hangup_reason IN ('missed', 'abandoned')
      ) AND disposition_code IS NULL) AS inbound_missed_abandoned,
      COUNT(*) FILTER (WHERE source IN ('8x8_outbound', 'aloware_outbound')) AS outbound_total,
      COUNT(*) FILTER (WHERE needs_disposition = true AND disposition_code IS NULL) AS pending_dispositions,
      COUNT(*) FILTER (WHERE disposition_code IS NOT NULL) AS dispositions_submitted,
      COUNT(*) FILTER (WHERE disposition_source = 'aloware_agent') AS aloware_agent_dispositions,
      COUNT(*) FILTER (WHERE disposition_source = 'manager') AS manager_dispositions,
      COUNT(*) FILTER (WHERE call_outcome = 'good') AS outcome_good,
      COUNT(*) FILTER (WHERE call_outcome = 'bad') AS outcome_bad,
      COUNT(*) FILTER (WHERE call_outcome = 'neutral') AS outcome_neutral
    FROM call_sessions
    WHERE COALESCE(started_at, created_at) >= now() - ${interval}::interval
  `;

  const byAgent = track === 'aloware_closer'
    ? await db`
    SELECT
      cs.track,
      ag.name AS agent_name,
      NULL::text AS agent_id_8x8,
      cs.aloware_user_id,
      COUNT(*) AS total_calls,
      COUNT(*) FILTER (WHERE cs.source IN ('aloware_inbound') AND (
        cs.disposition_code IS NOT NULL OR cs.cdr_answered = 'Answered'
        OR (cs.duration_sec IS NOT NULL AND cs.duration_sec > 0)
      )) AS inbound_answered,
      COUNT(*) FILTER (WHERE cs.source IN ('aloware_outbound')) AS outbound,
      COUNT(*) FILTER (WHERE cs.cdr_answered = 'Answered' OR cs.disposition_code IS NOT NULL) AS answered,
      COUNT(*) FILTER (WHERE cs.disposition_code IS NOT NULL) AS disposed,
      COUNT(*) FILTER (WHERE cs.needs_disposition = true AND cs.disposition_code IS NULL) AS pending,
      COUNT(*) FILTER (WHERE cs.call_outcome = 'good') AS outcome_good
    FROM call_sessions cs
    INNER JOIN agents ag ON ag.agent_id_aloware = cs.aloware_user_id
      AND ag.platform = 'aloware' AND ag.team = 'inbound_closers'
    WHERE COALESCE(cs.started_at, cs.created_at) >= now() - ${interval}::interval
      AND cs.track = 'aloware_closer'
      AND cs.source IN ('aloware_inbound', 'aloware_outbound')
    GROUP BY cs.track, ag.name, cs.aloware_user_id
    ORDER BY total_calls DESC
  `
    : track
    ? await db`
    SELECT
      cs.track,
      ag.name AS agent_name,
      cs.agent_id_8x8,
      NULL::text AS aloware_user_id,
      COUNT(*) AS total_calls,
      COUNT(*) FILTER (WHERE cs.source IN ('8x8_inbound') AND (
        cs.disposition_code IS NOT NULL OR cs.cdr_answered = 'Answered'
        OR (cs.duration_sec IS NOT NULL AND cs.duration_sec > 0)
      )) AS inbound_answered,
      COUNT(*) FILTER (WHERE cs.source IN ('8x8_outbound')) AS outbound,
      COUNT(*) FILTER (WHERE cs.cdr_answered = 'Answered' OR cs.disposition_code IS NOT NULL) AS answered,
      COUNT(*) FILTER (WHERE cs.disposition_code IS NOT NULL) AS disposed,
      COUNT(*) FILTER (WHERE cs.needs_disposition = true AND cs.disposition_code IS NULL) AS pending,
      COUNT(*) FILTER (WHERE cs.call_outcome = 'good') AS outcome_good
    FROM call_sessions cs
    INNER JOIN agents ag ON ag.agent_id_8x8 = cs.agent_id_8x8
      AND ag.platform = '8x8'
      AND ag.team = ${track === '8x8_closer' ? '8x8_closer' : track === 'verification' ? 'verification' : 'cs'}
    WHERE COALESCE(cs.started_at, cs.created_at) >= now() - ${interval}::interval
      AND cs.track = ${track}
      AND cs.source IN ('8x8_inbound', '8x8_outbound')
    GROUP BY cs.track, ag.name, cs.agent_id_8x8
    ORDER BY total_calls DESC
  `
    : await db`
    SELECT
      cs.track,
      ag.name AS agent_name,
      cs.agent_id_8x8,
      cs.aloware_user_id,
      COUNT(*) AS total_calls,
      COUNT(*) FILTER (WHERE cs.source IN ('8x8_inbound', 'aloware_inbound') AND (
        cs.disposition_code IS NOT NULL OR cs.cdr_answered = 'Answered'
        OR (cs.duration_sec IS NOT NULL AND cs.duration_sec > 0)
      )) AS inbound_answered,
      COUNT(*) FILTER (WHERE cs.source IN ('8x8_outbound', 'aloware_outbound')) AS outbound,
      COUNT(*) FILTER (WHERE cs.cdr_answered = 'Answered' OR cs.disposition_code IS NOT NULL) AS answered,
      COUNT(*) FILTER (WHERE cs.disposition_code IS NOT NULL) AS disposed,
      COUNT(*) FILTER (WHERE cs.needs_disposition = true AND cs.disposition_code IS NULL) AS pending,
      COUNT(*) FILTER (WHERE cs.call_outcome = 'good') AS outcome_good
    FROM call_sessions cs
    INNER JOIN agents ag ON (
      (cs.track = 'aloware_closer' AND cs.aloware_user_id = ag.agent_id_aloware AND ag.platform = 'aloware' AND ag.team = 'inbound_closers')
      OR (cs.track = '8x8_closer' AND cs.agent_id_8x8 = ag.agent_id_8x8 AND ag.platform = '8x8' AND ag.team = '8x8_closer')
      OR (cs.track = 'verification' AND cs.agent_id_8x8 = ag.agent_id_8x8 AND ag.platform = '8x8' AND ag.team = 'verification')
      OR (cs.track = 'cs' AND cs.agent_id_8x8 = ag.agent_id_8x8 AND ag.platform = '8x8' AND ag.team = 'cs')
    )
    WHERE COALESCE(cs.started_at, cs.created_at) >= now() - ${interval}::interval
      AND cs.track IN ('aloware_closer', '8x8_closer', 'verification', 'cs')
    GROUP BY cs.track, ag.name, cs.agent_id_8x8, cs.aloware_user_id
    ORDER BY cs.track, total_calls DESC
  `;

  const byTrack = trackKpis.map((k) => ({
    track: k.track,
    total_calls: k.total_calls,
    disposed: k.dispositions_submitted,
    pending: k.pending_dispositions,
    outcome_good: k.outcome_good,
    outcome_bad: k.outcome_bad,
    inbound_answer_rate: k.inbound_answer_rate,
  }));

  const missedFollowup = track === 'aloware_closer'
    ? await db`
    SELECT id, phone, lead_name, agent_name, track, started_at, cdr_missed, cdr_abandoned, hangup_reason
    FROM call_sessions
    WHERE COALESCE(started_at, created_at) >= now() - ${interval}::interval
      AND track = 'aloware_closer'
      AND source = 'aloware_inbound'
      AND (cdr_missed != '-' OR cdr_abandoned != '-' OR hangup_reason IN ('missed', 'abandoned'))
      AND disposition_code IS NULL
    ORDER BY started_at DESC
    LIMIT 50
  `
    : track
    ? await db`
    SELECT cs.id, cs.phone, cs.lead_name, cs.agent_name, cs.track, cs.started_at, cs.cdr_missed, cs.cdr_abandoned, cs.hangup_reason
    FROM call_sessions cs
    WHERE COALESCE(cs.started_at, cs.created_at) >= now() - ${interval}::interval
      AND cs.track IN ('8x8_closer', 'verification', 'cs')
      AND cs.track = ${track}
      AND cs.source IN ('8x8_inbound', '8x8_outbound')
      AND (cs.cdr_missed != '-' OR cs.cdr_abandoned != '-' OR cs.hangup_reason IN ('missed', 'abandoned'))
      AND cs.disposition_code IS NULL
      AND (
        cs.agent_id_8x8 IS NULL
        OR cs.agent_id_8x8 IN (
          SELECT agent_id_8x8 FROM agents WHERE platform = '8x8'
            AND team = ${track === '8x8_closer' ? '8x8_closer' : track === 'verification' ? 'verification' : 'cs'}
        )
      )
    ORDER BY cs.started_at DESC
    LIMIT 50
  `
    : await db`
    SELECT id, phone, lead_name, agent_name, track, started_at, cdr_missed, cdr_abandoned, hangup_reason
    FROM call_sessions
    WHERE COALESCE(started_at, created_at) >= now() - ${interval}::interval
      AND (
        (track = 'aloware_closer' AND source = 'aloware_inbound')
        OR track IN ('8x8_closer', 'verification', 'cs')
      )
      AND (cdr_missed != '-' OR cdr_abandoned != '-' OR hangup_reason IN ('missed', 'abandoned'))
      AND disposition_code IS NULL
    ORDER BY started_at DESC
    LIMIT 100
  `;

  const activeKpi = kpiForTrack;

  return {
    totals,
    trackKpis,
    activeKpi,
    byTrack,
    byAgent,
    missedFollowup,
    period,
    trackFilter: track,
  };
}

export type ScoreboardTeamFilter = 'all' | 'aloware' | '8x8';

export async function getScoreboardStats(teamFilter: ScoreboardTeamFilter = 'all') {
  const db = getDb();
  const weekMeta = getScoreboardWeek();

  const teams =
    teamFilter === 'aloware'
      ? ['inbound_closers']
      : teamFilter === '8x8'
        ? ['8x8_closer']
        : ['inbound_closers', '8x8_closer'];

  const roster = await db`
    SELECT name AS agent_name, team
    FROM agents
    WHERE team = ANY(${teams})
    ORDER BY name ASC
  `;

  const rows = await db`
    SELECT
      ag.name AS agent_name,
      EXTRACT(ISODOW FROM COALESCE(cs.started_at, cs.created_at) AT TIME ZONE 'America/New_York')::int AS dow,
      COUNT(*)::int AS leads,
      COUNT(*) FILTER (WHERE cs.call_outcome = 'good')::int AS deals,
      COALESCE(SUM(cs.job_value_cents) FILTER (WHERE cs.job_value_cents IS NOT NULL), 0)::bigint AS revenue_cents
    FROM call_sessions cs
    INNER JOIN agents ag ON (
      (ag.platform = 'aloware' AND cs.aloware_user_id = ag.agent_id_aloware AND ag.team = 'inbound_closers')
      OR (ag.platform = '8x8' AND cs.agent_id_8x8 = ag.agent_id_8x8 AND ag.team = '8x8_closer')
    )
    WHERE COALESCE(cs.started_at, cs.created_at) >= ${weekMeta.weekStart}
      AND COALESCE(cs.started_at, cs.created_at) < ${weekMeta.weekEnd}
      AND EXTRACT(ISODOW FROM COALESCE(cs.started_at, cs.created_at) AT TIME ZONE 'America/New_York') BETWEEN 1 AND 6
      AND ag.team = ANY(${teams})
      AND cs.track IN ('aloware_closer', '8x8_closer')
    GROUP BY ag.name, dow
    ORDER BY ag.name, dow
  `;

  return buildScoreboardPayload(
    roster.map((r) => ({
      agent_name: String(r.agent_name),
      team: String(r.team),
    })),
    rows.map((r) => ({
      agent_name: String(r.agent_name),
      dow: Number(r.dow),
      leads: Number(r.leads),
      deals: Number(r.deals),
      revenue_cents: Number(r.revenue_cents ?? 0),
    })),
    weekMeta
  );
}

const QUOTE_TRACKS = ['aloware_closer', '8x8_closer'] as const;

function quoteTrackSql(trackFilter?: CallTrack) {
  if (trackFilter === 'aloware_closer' || trackFilter === '8x8_closer') {
    return trackFilter;
  }
  return null;
}

export async function getQuoteTrackingStats(
  period: DashboardPeriod = 'week',
  trackFilter?: CallTrack
) {
  const db = getDb();
  const interval = periodInterval(period);
  const track = quoteTrackSql(trackFilter);
  const tracks = track ? [track] : [...QUOTE_TRACKS];

  const [summaryRow] = await db`
    SELECT
      COUNT(*) FILTER (WHERE cs.disposition_code = 'connected-quoted' OR cs.call_outcome = 'good')::int AS quotes_sent,
      COUNT(*) FILTER (WHERE cs.quote_type = 'booked')::int AS booked_count,
      COALESCE(SUM(cs.job_value_cents) FILTER (WHERE cs.job_value_cents IS NOT NULL), 0)::bigint AS total_quote_value_cents,
      COALESCE(SUM(cs.job_value_cents) FILTER (WHERE cs.quote_type = 'booked' AND cs.job_value_cents IS NOT NULL), 0)::bigint AS revenue_cents,
      COUNT(*) FILTER (WHERE cs.job_value_cents IS NOT NULL)::int AS quotes_with_value
    FROM call_sessions cs
    WHERE COALESCE(cs.started_at, cs.created_at) >= now() - ${interval}::interval
      AND cs.track = ANY(${tracks})
      AND (
        (cs.track = 'aloware_closer' AND cs.source IN ('aloware_inbound', 'aloware_outbound'))
        OR (cs.track = '8x8_closer' AND cs.source IN ('8x8_inbound', '8x8_outbound'))
      )
  `;

  const [depositRow] = await db`
    SELECT COUNT(*)::int AS deposits_collected
    FROM deal_events de
    WHERE de.event_at >= now() - ${interval}::interval
      AND (
        de.stage_name ILIKE '%deposit%'
        OR de.stage_name ILIKE '%book%'
        OR de.stage_name ILIKE '%won%'
        OR de.stage_id ILIKE '%deposit%'
        OR de.stage_id ILIKE '%book%'
      )
  `;

  const bookedCount = Number(summaryRow?.booked_count ?? 0);
  const totalQuoteValueCents = Number(summaryRow?.total_quote_value_cents ?? 0);
  const revenueCents = Number(summaryRow?.revenue_cents ?? 0);
  const quotesWithValue = Number(summaryRow?.quotes_with_value ?? 0);
  const depositsFromCallsOrEvents =
    bookedCount > 0 ? bookedCount : Number(depositRow?.deposits_collected ?? 0);

  const manualTotals = await sumManualQuoteTotals(period);
  const quotesSent = Number(summaryRow?.quotes_sent ?? 0) + manualTotals.quotes;
  const depositsCollected = depositsFromCallsOrEvents + manualTotals.deposits;
  const quoteToDepositPct =
    quotesSent > 0 ? Math.round((depositsCollected / quotesSent) * 10000) / 100 : null;
  const avgQuoteValueCents =
    quotesWithValue > 0 ? Math.round(totalQuoteValueCents / quotesWithValue) : null;

  const dailyRows = await db`
    SELECT
      (COALESCE(cs.started_at, cs.created_at) AT TIME ZONE 'America/New_York')::date AS day,
      COUNT(*) FILTER (WHERE cs.disposition_code = 'connected-quoted' OR cs.call_outcome = 'good')::int AS quotes
    FROM call_sessions cs
    WHERE COALESCE(cs.started_at, cs.created_at) >= now() - ${interval}::interval
      AND cs.track = ANY(${tracks})
      AND (
        (cs.track = 'aloware_closer' AND cs.source IN ('aloware_inbound', 'aloware_outbound'))
        OR (cs.track = '8x8_closer' AND cs.source IN ('8x8_inbound', '8x8_outbound'))
      )
    GROUP BY day
    ORDER BY day ASC
  `;

  const agentQuoteRows = await db`
    SELECT
      COALESCE(ag.name, cs.agent_name, 'Unknown') AS agent_name,
      COUNT(*) FILTER (WHERE cs.disposition_code = 'connected-quoted' OR cs.call_outcome = 'good')::int AS quotes_sent,
      COUNT(*) FILTER (WHERE cs.quote_type = 'booked')::int AS deposits_booked,
      COALESCE(SUM(cs.job_value_cents) FILTER (WHERE cs.job_value_cents IS NOT NULL), 0)::bigint AS revenue_cents
    FROM call_sessions cs
    LEFT JOIN agents ag ON (
      (cs.track = 'aloware_closer' AND cs.aloware_user_id = ag.agent_id_aloware AND ag.platform = 'aloware')
      OR (cs.track = '8x8_closer' AND cs.agent_id_8x8 = ag.agent_id_8x8 AND ag.platform = '8x8')
    )
    WHERE COALESCE(cs.started_at, cs.created_at) >= now() - ${interval}::interval
      AND cs.track = ANY(${tracks})
      AND (
        (cs.track = 'aloware_closer' AND cs.source IN ('aloware_inbound', 'aloware_outbound'))
        OR (cs.track = '8x8_closer' AND cs.source IN ('8x8_inbound', '8x8_outbound'))
      )
      AND (cs.disposition_code = 'connected-quoted' OR cs.call_outcome = 'good')
    GROUP BY COALESCE(ag.name, cs.agent_name, 'Unknown')
    ORDER BY quotes_sent DESC
  `;

  const agentDepositRows = await db`
    SELECT agent_name, COUNT(*)::int AS deposits_collected
    FROM deal_events de
    WHERE de.event_at >= now() - ${interval}::interval
      AND (
        de.stage_name ILIKE '%deposit%'
        OR de.stage_name ILIKE '%book%'
        OR de.stage_name ILIKE '%won%'
        OR de.stage_id ILIKE '%deposit%'
        OR de.stage_id ILIKE '%book%'
      )
      AND de.agent_name IS NOT NULL
    GROUP BY de.agent_name
  `;

  const depositMap = new Map(
    agentDepositRows.map((r) => [String(r.agent_name), Number(r.deposits_collected)])
  );

  const byAgent = agentQuoteRows.map((r) => {
    const name = String(r.agent_name);
    const booked = Number(r.deposits_booked ?? 0);
    const fromEvents = depositMap.get(name) ?? 0;
    return {
      agent_name: name,
      quotes_sent: Number(r.quotes_sent),
      deposits_collected: booked > 0 ? booked : fromEvents,
      revenue: Math.round(Number(r.revenue_cents ?? 0) / 100),
    };
  });

  for (const [name, deposits] of depositMap) {
    if (!byAgent.some((a) => a.agent_name === name)) {
      byAgent.push({
        agent_name: name,
        quotes_sent: 0,
        deposits_collected: deposits,
        revenue: 0,
      });
    }
  }

  const manualByAgent = await listManualQuoteTotalsByAgent(period);
  for (const row of manualByAgent) {
    const existing = byAgent.find((a) => a.agent_name === row.agent_name);
    if (existing) {
      existing.quotes_sent += row.quotes;
      existing.deposits_collected += row.deposits;
    } else {
      byAgent.push({
        agent_name: row.agent_name,
        quotes_sent: row.quotes,
        deposits_collected: row.deposits,
        revenue: 0,
      });
    }
  }

  byAgent.sort((a, b) => b.quotes_sent - a.quotes_sent || b.deposits_collected - a.deposits_collected);

  const dailyTrend = dailyRows.map((r) => {
    const d = new Date(String(r.day));
    return {
      date: String(r.day),
      label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
      quotes: Number(r.quotes),
    };
  });

  const nowEt = new Date();
  const monthLabel = nowEt.toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'America/New_York',
  });

  return {
    period,
    trackFilter: track,
    summary: {
      quotes_sent: quotesSent,
      total_quote_value: Math.round(totalQuoteValueCents / 100),
      deposits_collected: depositsCollected,
      revenue_generated: Math.round(revenueCents / 100),
      quote_to_deposit_pct: quoteToDepositPct,
      avg_quote_value: avgQuoteValueCents != null ? Math.round(avgQuoteValueCents / 100) : null,
    },
    dailyTrend,
    monthlyQuoteValue: [{ label: monthLabel, value: quotesSent }],
    byAgent,
    dataNote:
      manualTotals.quotes + manualTotals.deposits > 0
        ? 'Includes Granot manual entries (call + email quotes and deposits) plus system call data.'
        : totalQuoteValueCents > 0
          ? 'Dollar values and deposits from manager-entered Quote sent / Deposit collected details below.'
          : 'Log Granot totals below (call / email quotes + deposits), or enter job value on Aloware calls.',
  } satisfies QuoteTrackingPayload;
}

export type QuoteEntryCall = {
  id: string;
  phone: string;
  lead_name: string | null;
  agent_name: string | null;
  started_at: Date | null;
  disposition_code: string | null;
  call_outcome: string;
  quote_type: string | null;
  job_value_cents: number | null;
  move_date: string | null;
  origin_city: string | null;
  destination_city: string | null;
  quote_details_at: Date | null;
};

export async function listQuoteEntryCalls(limit = 100): Promise<QuoteEntryCall[]> {
  const db = getDb();
  const rows = await db`
    SELECT
      cs.id,
      cs.phone,
      cs.lead_name,
      COALESCE(ag.name, cs.aloware_user_name, cs.agent_name) AS agent_name,
      cs.started_at,
      cs.disposition_code,
      cs.call_outcome,
      cs.quote_type,
      cs.job_value_cents,
      cs.move_date::text AS move_date,
      cs.origin_city,
      cs.destination_city,
      cs.quote_details_at
    FROM call_sessions cs
    LEFT JOIN agents ag ON ag.agent_id_aloware = cs.aloware_user_id AND ag.platform = 'aloware'
    WHERE cs.track = 'aloware_closer'
      AND cs.source IN ('aloware_inbound', 'aloware_outbound')
      AND (
        cs.call_outcome = 'good'
        OR cs.disposition_code = 'connected-quoted'
      )
    ORDER BY
      (cs.job_value_cents IS NULL) DESC,
      COALESCE(cs.started_at, cs.created_at) DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({
    id: String(r.id),
    phone: String(r.phone),
    lead_name: r.lead_name != null ? String(r.lead_name) : null,
    agent_name: r.agent_name != null ? String(r.agent_name) : null,
    started_at: r.started_at as Date | null,
    disposition_code: r.disposition_code != null ? String(r.disposition_code) : null,
    call_outcome: String(r.call_outcome),
    quote_type: r.quote_type != null ? String(r.quote_type) : null,
    job_value_cents: r.job_value_cents != null ? Number(r.job_value_cents) : null,
    move_date: r.move_date != null ? String(r.move_date) : null,
    origin_city: r.origin_city != null ? String(r.origin_city) : null,
    destination_city: r.destination_city != null ? String(r.destination_city) : null,
    quote_details_at: r.quote_details_at as Date | null,
  }));
}

export async function updateQuoteDetails(params: {
  callId: string;
  quoteType: 'quoted' | 'booked';
  jobValueCents: number;
  moveDate?: string | null;
  originCity?: string | null;
  destinationCity?: string | null;
  enteredBy?: string | null;
}) {
  const db = getDb();
  const rows = await db`
    UPDATE call_sessions SET
      quote_type = ${params.quoteType},
      job_value_cents = ${params.jobValueCents},
      move_date = ${params.moveDate || null},
      origin_city = ${params.originCity?.trim() || null},
      destination_city = ${params.destinationCity?.trim() || null},
      quote_details_at = now(),
      quote_entered_by = ${params.enteredBy || 'manager'},
      updated_at = now()
    WHERE id = ${params.callId}
      AND track = 'aloware_closer'
    RETURNING id, quote_type, job_value_cents, move_date, origin_city, destination_city
  `;
  return rows[0] ?? null;
}

export async function upsertInventoryIntake(parsed: import('./inventory-intake').ParsedInventoryIntake) {
  const db = getDb();

  if (parsed.retellCallId) {
    const existing = await db`
      SELECT id FROM inventory_intakes WHERE retell_call_id = ${parsed.retellCallId} LIMIT 1
    `;
    if (existing[0]) {
      const rows = await db`
        UPDATE inventory_intakes SET
          contact_id = ${parsed.contactId},
          opportunity_id = ${parsed.opportunityId},
          lead_name = ${parsed.leadName},
          transcript = ${parsed.transcript},
          recording_url = ${parsed.recordingUrl},
          call_summary = ${parsed.callSummary},
          outcome = ${parsed.outcome},
          callback_confirmed = ${parsed.callbackConfirmed},
          move_date = ${parsed.moveDate},
          move_type = ${parsed.moveType},
          home_size = ${parsed.homeSize},
          bedroom_contents = ${parsed.bedroomContents},
          living_room_contents = ${parsed.livingRoomContents},
          dining_room_contents = ${parsed.diningRoomContents},
          kitchen_contents = ${parsed.kitchenContents},
          office_contents = ${parsed.officeContents},
          garage_outdoor_contents = ${parsed.garageOutdoorContents},
          special_items = ${parsed.specialItems},
          box_count_estimate = ${parsed.boxCountEstimate},
          storage_needed = ${parsed.storageNeeded},
          pickup_address = ${parsed.pickupAddress},
          dropoff_address = ${parsed.dropoffAddress},
          access_notes = ${parsed.accessNotes},
          lead_sentiment = ${parsed.leadSentiment},
          raw_payload = ${db.json(parsed.raw as never)},
          updated_at = now()
        WHERE retell_call_id = ${parsed.retellCallId}
        RETURNING *
      `;
      return { row: rows[0], created: false };
    }
  }

  const rows = await db`
    INSERT INTO inventory_intakes (
      retell_call_id, contact_id, opportunity_id, lead_name,
      transcript, recording_url, call_summary, outcome, callback_confirmed,
      move_date, move_type, home_size,
      bedroom_contents, living_room_contents, dining_room_contents, kitchen_contents,
      office_contents, garage_outdoor_contents, special_items,
      box_count_estimate, storage_needed, pickup_address, dropoff_address,
      access_notes, lead_sentiment, raw_payload
    ) VALUES (
      ${parsed.retellCallId}, ${parsed.contactId}, ${parsed.opportunityId}, ${parsed.leadName},
      ${parsed.transcript}, ${parsed.recordingUrl}, ${parsed.callSummary}, ${parsed.outcome},
      ${parsed.callbackConfirmed},
      ${parsed.moveDate}, ${parsed.moveType}, ${parsed.homeSize},
      ${parsed.bedroomContents}, ${parsed.livingRoomContents}, ${parsed.diningRoomContents},
      ${parsed.kitchenContents},
      ${parsed.officeContents}, ${parsed.garageOutdoorContents}, ${parsed.specialItems},
      ${parsed.boxCountEstimate}, ${parsed.storageNeeded}, ${parsed.pickupAddress},
      ${parsed.dropoffAddress},
      ${parsed.accessNotes}, ${parsed.leadSentiment}, ${db.json(parsed.raw as never)}
    )
    RETURNING *
  `;
  return { row: rows[0], created: true };
}

export async function listInventoryIntakes(limit = 100) {
  const db = getDb();
  const safeLimit = Math.min(Math.max(limit, 1), 500);
  return db`
    SELECT * FROM inventory_intakes
    ORDER BY created_at DESC
    LIMIT ${safeLimit}
  `;
}

function periodStartCutoff(period: DashboardPeriod): string {
  const days = period === 'day' ? 0 : period === 'week' ? 6 : 29;
  const [y, m, d] = todayEtYmd().split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - days);
  return dt.toISOString().slice(0, 10);
}

function todayEtYmd(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Closers shown on the Granot entry sheet. */
export async function listQuoteManualAgents() {
  const db = getDb();
  return db`
    SELECT id, name, platform, team
    FROM agents
    WHERE team IN ('inbound_closers', '8x8_closer')
    ORDER BY
      CASE team WHEN 'inbound_closers' THEN 0 ELSE 1 END,
      name
  `;
}

export async function getManualQuoteSheet(periodType: 'day' | 'week', periodStart: string) {
  const db = getDb();
  const agents = await listQuoteManualAgents();
  const rows = await db`
    SELECT agent_id, quotes_call, quotes_email, deposits_collected, entered_by, updated_at
    FROM agent_quote_manual
    WHERE period_type = ${periodType}
      AND period_start = ${periodStart}::date
  `;
  const byAgent = new Map(
    rows.map((r) => [
      String(r.agent_id),
      {
        quotesCall: Number(r.quotes_call),
        quotesEmail: Number(r.quotes_email),
        depositsCollected: Number(r.deposits_collected),
        enteredBy: r.entered_by != null ? String(r.entered_by) : null,
        updatedAt: r.updated_at as Date | null,
      },
    ])
  );

  return agents.map((a) => {
    const existing = byAgent.get(String(a.id));
    return {
      agentId: String(a.id),
      agentName: String(a.name),
      platform: String(a.platform),
      team: a.team != null ? String(a.team) : null,
      quotesCall: existing?.quotesCall ?? 0,
      quotesEmail: existing?.quotesEmail ?? 0,
      depositsCollected: existing?.depositsCollected ?? 0,
      enteredBy: existing?.enteredBy ?? null,
      updatedAt: existing?.updatedAt ?? null,
    };
  });
}

export async function upsertManualQuoteRows(params: {
  periodType: 'day' | 'week';
  periodStart: string;
  enteredBy: string;
  rows: Array<{
    agentId: string;
    quotesCall: number;
    quotesEmail: number;
    depositsCollected: number;
  }>;
}) {
  const db = getDb();
  let saved = 0;
  for (const row of params.rows) {
    await db`
      INSERT INTO agent_quote_manual (
        agent_id, period_type, period_start,
        quotes_call, quotes_email, deposits_collected,
        entered_by, updated_at
      ) VALUES (
        ${row.agentId}::uuid,
        ${params.periodType},
        ${params.periodStart}::date,
        ${row.quotesCall},
        ${row.quotesEmail},
        ${row.depositsCollected},
        ${params.enteredBy},
        now()
      )
      ON CONFLICT (agent_id, period_type, period_start) DO UPDATE SET
        quotes_call = EXCLUDED.quotes_call,
        quotes_email = EXCLUDED.quotes_email,
        deposits_collected = EXCLUDED.deposits_collected,
        entered_by = EXCLUDED.entered_by,
        updated_at = now()
    `;
    saved += 1;
  }
  return { saved };
}

async function sumManualQuoteTotals(period: DashboardPeriod) {
  const db = getDb();
  const cutoff = periodStartCutoff(period);
  const today = todayEtYmd();
  const [row] = await db`
    SELECT
      COALESCE(SUM(quotes_call + quotes_email), 0)::int AS quotes,
      COALESCE(SUM(deposits_collected), 0)::int AS deposits
    FROM agent_quote_manual
    WHERE period_start >= ${cutoff}::date
      AND period_start <= ${today}::date
      AND (
        period_type = 'day'
        OR period_type = 'week'
      )
  `;
  return {
    quotes: Number(row?.quotes ?? 0),
    deposits: Number(row?.deposits ?? 0),
  };
}

async function listManualQuoteTotalsByAgent(period: DashboardPeriod) {
  const db = getDb();
  const cutoff = periodStartCutoff(period);
  const today = todayEtYmd();
  const rows = await db`
    SELECT
      ag.name AS agent_name,
      COALESCE(SUM(m.quotes_call + m.quotes_email), 0)::int AS quotes,
      COALESCE(SUM(m.deposits_collected), 0)::int AS deposits
    FROM agent_quote_manual m
    INNER JOIN agents ag ON ag.id = m.agent_id
    WHERE m.period_start >= ${cutoff}::date
      AND m.period_start <= ${today}::date
    GROUP BY ag.name
  `;
  return rows.map((r) => ({
    agent_name: String(r.agent_name),
    quotes: Number(r.quotes),
    deposits: Number(r.deposits),
  }));
}
