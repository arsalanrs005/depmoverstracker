'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AgentTable,
  KpiGrid,
  MANAGER_TRACKS,
  MissedList,
  TrackSection,
  emptyTrackKpi,
  kpiForManagerTrack,
} from '@/components/ManagerDashboard';
import {
  kpiCardsForTrack,
  type TrackKpiRow,
} from '@/lib/dashboard-kpis';
import { TRACK_LABELS, TRACK_ORDER, TRACK_TAB_LABELS, type CallTrack } from '@/lib/tracks';

type Period = 'day' | 'week' | 'month';
type TrackFilter = 'all' | CallTrack;

type Stats = {
  trackKpis: TrackKpiRow[];
  activeKpi: TrackKpiRow | null;
  byAgent: Array<Record<string, unknown>>;
  missedFollowup: Array<Record<string, unknown>>;
  period: Period;
  trackFilter?: CallTrack | null;
};

export default function ManagerDashboardPage() {
  const [period, setPeriod] = useState<Period>('week');
  const [track, setTrack] = useState<TrackFilter>('all');
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const trackQ = track !== 'all' ? `&track=${track}` : '';
      const res = await fetch(`/api/dashboard/stats?period=${period}${trackQ}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to load');
      setStats(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [period, track]);

  useEffect(() => {
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [load]);

  const trackKpis: TrackKpiRow[] = stats?.trackKpis ?? [];
  const activeKpi =
    stats?.activeKpi ??
    (track !== 'all' ? kpiForManagerTrack(trackKpis, track) : null);

  return (
    <>
      <header className="page-header">
        <h1 className="page-title">Manager Dashboard</h1>
        <p className="page-subtitle">
          {track === 'all'
            ? 'All tracks — stacked view with per-team KPIs and agents.'
            : `${TRACK_LABELS[track]} only — inbound answer rate uses inbound calls; outbound is count only.`}
        </p>
      </header>

      <div className="pill-tabs pill-tabs--wide">
        {(['day', 'week', 'month'] as Period[]).map((p) => (
          <button
            key={p}
            type="button"
            className={period === p ? 'active' : ''}
            onClick={() => setPeriod(p)}
            title={p === 'day' ? 'Today' : p === 'week' ? 'Last 7 days' : '30 days'}
          >
            {p === 'day' ? 'Today' : p === 'week' ? '7 days' : '30 days'}
          </button>
        ))}
      </div>

      <div className="pill-tabs pill-tabs--wide" style={{ marginTop: '0.5rem' }}>
        <button
          type="button"
          className={track === 'all' ? 'active' : ''}
          onClick={() => setTrack('all')}
          title="All tracks"
        >
          {TRACK_TAB_LABELS.all}
        </button>
        {TRACK_ORDER.filter((tr) => tr !== 'retell').map((tr) => (
          <button
            key={tr}
            type="button"
            className={track === tr ? 'active' : ''}
            onClick={() => setTrack(tr)}
            title={TRACK_LABELS[tr]}
          >
            {TRACK_TAB_LABELS[tr]}
          </button>
        ))}
      </div>

      {loading && <p className="loading-pulse">Loading metrics…</p>}

      {error && (
        <div className="card card-error">
          {error.includes('DATABASE_URL')
            ? 'Database not connected. Set DATABASE_URL in .env.local.'
            : error}
        </div>
      )}

      {stats && !loading && track === 'all' && (
        <div className="track-stack">
          {MANAGER_TRACKS.map((tr) => (
            <TrackSection
              key={tr}
              kpi={kpiForManagerTrack(trackKpis, tr)}
              agents={stats.byAgent}
              missed={stats.missedFollowup}
              compactSummary
              onDrillDown={() => setTrack(tr)}
            />
          ))}
        </div>
      )}

      {stats && !loading && track !== 'all' && activeKpi && (
        <>
          <KpiGrid cards={kpiCardsForTrack(activeKpi)} />

          <h2 className="section-title">By agent</h2>
          <AgentTable agents={stats.byAgent} track={track} />

          {(track === 'aloware_closer' || track === '8x8_closer') && (
            <div style={{ marginTop: '1.5rem' }}>
              <MissedList
                items={stats.missedFollowup}
                track={track}
                showDispositionLink={track === '8x8_closer'}
              />
            </div>
          )}

          {(track === 'verification' || track === 'cs') && Number(activeKpi.pending_dispositions) > 0 && (
            <p style={{ marginTop: '1rem', fontSize: '0.9rem' }}>
              <a href="/agent/dispositions">Log pending dispositions →</a>
            </p>
          )}
        </>
      )}

      {stats && !loading && track !== 'all' && !activeKpi && (
        <>
          <KpiGrid cards={kpiCardsForTrack(emptyTrackKpi(track))} />
          <div className="empty-state">No calls for this track in the selected period.</div>
        </>
      )}
    </>
  );
}
