import postgres from 'postgres';
import type { ParsedCdrCall } from './cdr-parser';
import { findGhlContactByPhone } from './ghl-lookup';
import type { ParsedAlowareCall } from './aloware-webhook';
import type { CallTrack } from './tracks';
import { isValidTrack } from './tracks';
import { normalizeTrackKpiRow, type TrackKpiRow } from './dashboard-kpis';

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
