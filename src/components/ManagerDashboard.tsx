'use client';

import Link from 'next/link';
import {
  kpiCardsForTrack,
  summaryCardsForTrack,
  type KpiCard,
  type TrackKpiRow,
  MANAGER_TRACKS,
} from '@/lib/dashboard-kpis';
import { TRACK_LABELS, type CallTrack } from '@/lib/tracks';

function fmtTime(d: unknown) {
  if (!d) return '—';
  return new Date(String(d)).toLocaleString('en-US', { timeZone: 'America/New_York' });
}

function toneClass(tone?: KpiCard['tone']) {
  if (tone === 'good') return 'good';
  if (tone === 'warn') return 'warn';
  if (tone === 'bad') return 'bad';
  if (tone === 'highlight') return 'highlight';
  return '';
}

export function KpiGrid({ cards, compact }: { cards: KpiCard[]; compact?: boolean }) {
  return (
    <div className={compact ? 'grid-stats grid-stats-compact' : 'grid-stats'}>
      {cards.map((c) => (
        <div key={c.key} className={`stat-card ${toneClass(c.tone)}`}>
          <div className="stat-value">{c.value}</div>
          <div className="stat-label">{c.label}</div>
          {c.sub && (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
              {c.sub}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

type AgentRow = Record<string, unknown>;

export function AgentTable({
  agents,
  track,
  showTrack = false,
}: {
  agents: AgentRow[];
  track?: CallTrack;
  showTrack?: boolean;
}) {
  const filtered = track ? agents.filter((a) => a.track === track) : agents;

  if (filtered.length === 0) {
    return <div className="empty-state">No agent activity in this period.</div>;
  }

  const isAlo = track === 'aloware_closer';

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {showTrack && <th>Track</th>}
            <th>Agent</th>
            <th>{isAlo ? 'Alo ID' : 'Ext'}</th>
            <th>Total</th>
            <th>Inbound ans.</th>
            <th>Outbound</th>
            <th>Quoted</th>
            {isAlo && <th>Deposit pending</th>}
            {isAlo && <th>Deposit collected</th>}
            {!isAlo && <th>Pending</th>}
          </tr>
        </thead>
        <tbody>
          {filtered.map((a, i) => (
            <tr key={`${a.track}-${a.agent_name}-${i}`}>
              {showTrack && (
                <td>{TRACK_LABELS[a.track as CallTrack] ?? String(a.track)}</td>
              )}
              <td style={{ fontWeight: 600 }}>{String(a.agent_name)}</td>
              <td>{String(a.agent_id_8x8 ?? a.aloware_user_id ?? '—')}</td>
              <td><strong>{String(a.total_calls)}</strong></td>
              <td>{String(a.inbound_answered ?? a.answered ?? 0)}</td>
              <td>{String(a.outbound ?? 0)}</td>
              <td>{String(a.outcome_good ?? 0)}</td>
              {isAlo && <td>{String(a.booked_pending ?? 0)}</td>}
              {isAlo && <td>{String(a.booked_collected ?? 0)}</td>}
              {!isAlo && (
                <td>
                  {Number(a.pending) > 0 ? (
                    <span className="badge pending">{String(a.pending)}</span>
                  ) : (
                    '0'
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MissedList({
  items,
  track,
  showDispositionLink,
}: {
  items: Record<string, unknown>[];
  track?: CallTrack;
  showDispositionLink?: boolean;
}) {
  if (items.length === 0) {
    return (
      <div className="empty-state" style={{ marginBottom: 0 }}>
        No missed or abandoned inbound calls in this period.
      </div>
    );
  }

  const title =
    track === 'aloware_closer'
      ? 'Missed inbound (Retell / callbacks not answered)'
      : 'Missed inbound — needs callback or manager disposition';

  return (
    <>
      <h3 className="subsection-title">{title}</h3>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <ul className="alert-list">
          {items.map((m) => (
            <li key={String(m.id)}>
              <strong style={{ color: 'var(--blue-900)' }}>
                {String(m.lead_name ?? m.phone)}
              </strong>
              <span style={{ color: 'var(--text-muted)' }}> · {String(m.phone)}</span>
              <br />
              <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                {fmtTime(m.started_at)}
                {m.agent_name ? ` · ${String(m.agent_name)}` : ''}
                {m.hangup_reason ? ` · ${String(m.hangup_reason)}` : ''}
              </span>
            </li>
          ))}
        </ul>
      </div>
      {showDispositionLink && (
        <p style={{ marginTop: '0.75rem', fontSize: '0.85rem' }}>
          <Link href="/agent/dispositions">Open disposition queue →</Link>
        </p>
      )}
    </>
  );
}

export function TrackSection({
  kpi,
  agents,
  missed,
  compactSummary,
  onDrillDown,
}: {
  kpi: TrackKpiRow;
  agents: AgentRow[];
  missed: Record<string, unknown>[];
  compactSummary?: boolean;
  onDrillDown?: () => void;
}) {
  const cards = compactSummary ? summaryCardsForTrack(kpi) : kpiCardsForTrack(kpi);
  const showMissed =
    kpi.track === 'aloware_closer' ||
    kpi.track === '8x8_closer';
  const trackMissed = missed.filter((m) => m.track === kpi.track);

  return (
    <section className="track-section">
      <div className="track-section-header">
        <h2 className="section-title" style={{ marginBottom: 0 }}>
          {TRACK_LABELS[kpi.track]}
        </h2>
        {onDrillDown && (
          <button type="button" className="btn-text" onClick={onDrillDown}>
            View tab →
          </button>
        )}
      </div>
      <KpiGrid cards={cards} compact={compactSummary} />
      <h3 className="subsection-title">By agent</h3>
      <AgentTable agents={agents} track={kpi.track} />
      {showMissed && trackMissed.length > 0 && (
        <MissedList
          items={trackMissed}
          track={kpi.track}
          showDispositionLink={kpi.track === '8x8_closer'}
        />
      )}
    </section>
  );
}

export function emptyTrackKpi(track: CallTrack): TrackKpiRow {
  return {
    track,
    total_calls: 0,
    inbound_total: 0,
    inbound_answered: 0,
    inbound_missed_abandoned: 0,
    outbound_total: 0,
    pending_dispositions: 0,
    dispositions_submitted: 0,
    outcome_good: 0,
    outcome_bad: 0,
    outcome_neutral: 0,
    inbound_answer_rate: null,
    disposition_counts: {},
    quoted_count: 0,
    booked_pending_count: 0,
    booked_collected_count: 0,
  };
}

export function kpiForManagerTrack(
  trackKpis: TrackKpiRow[],
  track: CallTrack
): TrackKpiRow {
  return trackKpis.find((k) => k.track === track) ?? emptyTrackKpi(track);
}

export { MANAGER_TRACKS };
