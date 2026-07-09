'use client';

import type { TrackKpiRow } from '@/lib/dashboard-kpis';
import { TRACK_LABELS, type CallTrack } from '@/lib/tracks';

/** Simple horizontal bar chart — no external chart library */
export function AgentBarChart({
  agents,
  valueKey,
  label,
  maxBars = 10,
}: {
  agents: Array<Record<string, unknown>>;
  valueKey: string;
  label: string;
  maxBars?: number;
}) {
  const rows = [...agents]
    .map((a) => ({
      name: String(a.agent_name ?? 'Unknown'),
      value: Number(a[valueKey] ?? 0),
    }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, maxBars);

  const max = Math.max(...rows.map((r) => r.value), 1);

  if (rows.length === 0) {
    return <div className="scc-chart-empty">No data for this period.</div>;
  }

  return (
    <div className="scc-bar-chart">
      <p className="scc-chart-label">{label}</p>
      {rows.map((r) => (
        <div key={r.name} className="scc-bar-row">
          <span className="scc-bar-name">{r.name}</span>
          <div className="scc-bar-track">
            <div
              className="scc-bar-fill"
              style={{ width: `${Math.round((r.value / max) * 100)}%` }}
            />
          </div>
          <span className="scc-bar-val">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

export function ExecutiveKpiRow({ trackKpis }: { trackKpis: TrackKpiRow[] }) {
  const alo = trackKpis.find((k) => k.track === 'aloware_closer');
  const x8x = trackKpis.find((k) => k.track === '8x8_closer');
  const ver = trackKpis.find((k) => k.track === 'verification');
  const cs = trackKpis.find((k) => k.track === 'cs');

  const totalCalls = trackKpis.reduce((s, k) => s + k.total_calls, 0);
  const totalInbound = trackKpis.reduce((s, k) => s + k.inbound_total, 0);
  const totalAnswered = trackKpis.reduce((s, k) => s + k.inbound_answered, 0);
  const answerRate = totalInbound > 0 ? Math.round((totalAnswered / totalInbound) * 1000) / 10 : null;
  const pending = trackKpis.reduce((s, k) => s + k.pending_dispositions, 0);
  const quoted = trackKpis.reduce((s, k) => s + k.outcome_good, 0);

  const cards = [
    { label: 'Total Calls', value: totalCalls, tone: 'primary' },
    { label: 'Inbound Answer Rate', value: answerRate != null ? `${answerRate}%` : '—', tone: 'accent' },
    { label: 'Aloware Closers', value: alo?.total_calls ?? 0, sub: alo?.inbound_answer_rate != null ? `${alo.inbound_answer_rate}% ans` : undefined },
    { label: '8x8 Closers', value: x8x?.total_calls ?? 0, sub: `${x8x?.pending_dispositions ?? 0} pending` },
    { label: 'Quoted', value: quoted, tone: 'good' },
    { label: 'Pending Disposition', value: pending, tone: pending > 0 ? 'warn' : undefined },
    { label: 'Verification', value: ver?.total_calls ?? 0 },
    { label: 'Customer Success', value: cs?.total_calls ?? 0 },
  ];

  return (
    <div className="scc-kpi-row">
      {cards.map((c) => (
        <div key={c.label} className={`scc-kpi-card ${c.tone ? `tone-${c.tone}` : ''}`}>
          <div className="scc-kpi-value">{c.value}</div>
          <div className="scc-kpi-label">{c.label}</div>
          {c.sub && <div className="scc-kpi-sub">{c.sub}</div>}
        </div>
      ))}
    </div>
  );
}

export function TrackSummaryCards({ trackKpis }: { trackKpis: TrackKpiRow[] }) {
  return (
    <div className="scc-track-grid">
      {(['aloware_closer', '8x8_closer', 'verification', 'cs'] as CallTrack[]).map((tr) => {
        const k = trackKpis.find((x) => x.track === tr);
        if (!k) return null;
        return (
          <div key={tr} className="scc-panel">
            <h3 className="scc-panel-title">{TRACK_LABELS[tr]}</h3>
            <div className="scc-panel-stats">
              <div><strong>{k.total_calls}</strong><span>calls</span></div>
              <div><strong>{k.inbound_answer_rate != null ? `${k.inbound_answer_rate}%` : '—'}</strong><span>inbound ans</span></div>
              <div><strong>{k.outcome_good}</strong><span>quoted</span></div>
              <div><strong>{k.pending_dispositions}</strong><span>pending</span></div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
