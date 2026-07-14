'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CommandHeader, FilterSelect } from '@/components/CommandHeader';
import { AgentBarChart, ExecutiveKpiRow } from '@/components/CommandCharts';
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
  alowareOpsCards,
  alowareQuoteTrackerCards,
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

function DashboardInner() {
  const searchParams = useSearchParams();
  const initialPeriod = searchParams.get('period') === 'day' ? 'day' : 'week';

  const [period, setPeriod] = useState<Period>(initialPeriod);
  const [track, setTrack] = useState<TrackFilter>('all');
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (searchParams.get('period') === 'day') setPeriod('day');
  }, [searchParams]);

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

  const isDaily = period === 'day';
  const title = isDaily ? 'Daily Scoreboard' : 'Executive Dashboard';
  const subtitle =
    track === 'all'
      ? isDaily
        ? 'Today’s call activity across all tracks — refreshes every 5 minutes.'
        : 'Cross-track KPIs, agent performance, and missed inbound — Jason-style command center view.'
      : `${TRACK_LABELS[track]} only — inbound answer rate uses inbound calls; outbound is count only.`;

  return (
    <>
      <CommandHeader
        title={title}
        subtitle={subtitle}
        filters={
          <>
            <FilterSelect
              label="Period"
              value={period}
              onChange={(v) => setPeriod(v as Period)}
              options={[
                { value: 'day', label: 'Today' },
                { value: 'week', label: 'Last 7 days' },
                { value: 'month', label: '30 days' },
              ]}
            />
            <FilterSelect
              label="Track"
              value={track}
              onChange={(v) => setTrack(v as TrackFilter)}
              options={[
                { value: 'all', label: 'All tracks' },
                ...TRACK_ORDER.filter((tr) => tr !== 'retell').map((tr) => ({
                  value: tr,
                  label: TRACK_TAB_LABELS[tr],
                })),
              ]}
            />
          </>
        }
      />

      <div className="scc-content">
        <div className="scc-pill-tabs">
          {(['day', 'week', 'month'] as Period[]).map((p) => (
            <button
              key={p}
              type="button"
              className={period === p ? 'active' : ''}
              onClick={() => setPeriod(p)}
            >
              {p === 'day' ? 'Today' : p === 'week' ? '7 days' : '30 days'}
            </button>
          ))}
        </div>

        <div className="scc-pill-tabs">
          <button
            type="button"
            className={track === 'all' ? 'active' : ''}
            onClick={() => setTrack('all')}
          >
            {TRACK_TAB_LABELS.all}
          </button>
          {TRACK_ORDER.filter((tr) => tr !== 'retell').map((tr) => (
            <button
              key={tr}
              type="button"
              className={track === tr ? 'active' : ''}
              onClick={() => setTrack(tr)}
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
          <>
            <ExecutiveKpiRow trackKpis={trackKpis} />

            <div className="scc-chart-grid">
              <div className="scc-panel">
                <AgentBarChart
                  agents={stats.byAgent}
                  valueKey="total_calls"
                  label="Call volume by agent"
                />
              </div>
              <div className="scc-panel">
                <AgentBarChart
                  agents={stats.byAgent}
                  valueKey="outcome_good"
                  label="Quoted by agent"
                />
              </div>
              <div className="scc-panel">
                <AgentBarChart
                  agents={stats.byAgent}
                  valueKey="pending"
                  label="Pending dispositions by agent"
                />
              </div>
            </div>

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
          </>
        )}

        {stats && !loading && track !== 'all' && activeKpi && (
          <>
            {track === 'aloware_closer' ? (
              <>
                <h2 className="section-title">Quote tracker</h2>
                <KpiGrid cards={alowareQuoteTrackerCards(activeKpi)} />
                <h2 className="section-title" style={{ marginTop: '1.25rem' }}>Call activity</h2>
                <KpiGrid cards={alowareOpsCards(activeKpi)} />
              </>
            ) : (
              <KpiGrid cards={kpiCardsForTrack(activeKpi)} />
            )}

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
      </div>
    </>
  );
}

export default function ManagerDashboardPage() {
  return (
    <Suspense fallback={<p className="loading-pulse scc-content">Loading dashboard…</p>}>
      <DashboardInner />
    </Suspense>
  );
}
