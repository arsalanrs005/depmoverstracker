'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { CommandHeader, FilterSelect } from '@/components/CommandHeader';
import { AgentTable } from '@/components/ManagerDashboard';
import type { TrackKpiRow } from '@/lib/dashboard-kpis';

type Period = 'day' | 'week' | 'month';

function LeaderboardInner() {
  const [period, setPeriod] = useState<Period>('week');
  const [byAgent, setByAgent] = useState<Array<Record<string, unknown>>>([]);
  const [trackKpis, setTrackKpis] = useState<TrackKpiRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard/stats?period=${period}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to load');
      setByAgent(data.byAgent ?? []);
      setTrackKpis(data.trackKpis ?? []);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    load();
  }, [load]);

  const topQuoted = [...byAgent]
    .sort((a, b) => Number(b.outcome_good ?? 0) - Number(a.outcome_good ?? 0))[0];
  const topCalls = [...byAgent]
    .sort((a, b) => Number(b.total_calls ?? 0) - Number(a.total_calls ?? 0))[0];
  const totalQuoted = trackKpis.reduce((s, k) => s + k.outcome_good, 0);

  return (
    <>
      <CommandHeader
        title="Leaderboard"
        subtitle="Agent rankings by call volume and quoted outcomes for the selected period."
        filters={
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
        }
      />

      <div className="scc-content">
        {loading && <p className="loading-pulse">Loading…</p>}
        {error && <div className="card card-error">{error}</div>}

        { !loading && !error && (
          <>
            <div className="scc-kpi-row">
              <div className="scc-kpi-card tone-primary">
                <div className="scc-kpi-value">{String(topCalls?.agent_name ?? '—')}</div>
                <div className="scc-kpi-label">Top call volume</div>
                {topCalls && (
                  <div className="scc-kpi-sub">{String(topCalls.total_calls)} calls</div>
                )}
              </div>
              <div className="scc-kpi-card tone-good">
                <div className="scc-kpi-value">{String(topQuoted?.agent_name ?? '—')}</div>
                <div className="scc-kpi-label">Top quoted</div>
                {topQuoted && (
                  <div className="scc-kpi-sub">{String(topQuoted.outcome_good)} quoted</div>
                )}
              </div>
              <div className="scc-kpi-card">
                <div className="scc-kpi-value">{totalQuoted}</div>
                <div className="scc-kpi-label">Total quoted</div>
              </div>
            </div>

            <h2 className="section-title">All agents</h2>
            <AgentTable agents={byAgent} showTrack />
          </>
        )}
      </div>
    </>
  );
}

export default function LeaderboardPage() {
  return (
    <Suspense fallback={<p className="loading-pulse scc-content">Loading…</p>}>
      <LeaderboardInner />
    </Suspense>
  );
}
