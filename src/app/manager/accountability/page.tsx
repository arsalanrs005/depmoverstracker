'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CommandHeader, FilterSelect } from '@/components/CommandHeader';
import { AgentBarChart } from '@/components/CommandCharts';
import { MissedList } from '@/components/ManagerDashboard';
import type { TrackKpiRow } from '@/lib/dashboard-kpis';

type Period = 'day' | 'week' | 'month';

type Stats = {
  trackKpis: TrackKpiRow[];
  byAgent: Array<Record<string, unknown>>;
  missedFollowup: Array<Record<string, unknown>>;
};

function AccountabilityInner() {
  const [period, setPeriod] = useState<Period>('week');
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard/stats?period=${period}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to load');
      setStats(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    load();
  }, [load]);

  const trackKpis = stats?.trackKpis ?? [];
  const pending = trackKpis.reduce((s, k) => s + k.pending_dispositions, 0);
  const missed = stats?.missedFollowup?.length ?? 0;
  const noAnswer = trackKpis.reduce((s, k) => s + k.inbound_missed_abandoned, 0);

  return (
    <>
      <CommandHeader
        title="Accountability Dashboard"
        subtitle="Missed inbound, pending dispositions, and follow-ups that need manager attention."
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

        {stats && !loading && (
          <>
            <div className="scc-kpi-row">
              <div className="scc-kpi-card tone-warn">
                <div className="scc-kpi-value">{missed}</div>
                <div className="scc-kpi-label">Missed inbound</div>
              </div>
              <div className="scc-kpi-card tone-warn">
                <div className="scc-kpi-value">{pending}</div>
                <div className="scc-kpi-label">Pending disposition</div>
              </div>
              <div className="scc-kpi-card">
                <div className="scc-kpi-value">{noAnswer}</div>
                <div className="scc-kpi-label">Missed / abandoned</div>
              </div>
            </div>

            <div className="scc-chart-grid">
              <div className="scc-panel">
                <AgentBarChart
                  agents={stats.byAgent}
                  valueKey="pending"
                  label="Pending dispositions by agent"
                />
              </div>
            </div>

            <MissedList items={stats.missedFollowup} showDispositionLink />

            {pending > 0 && (
              <p style={{ marginTop: '1rem' }}>
                <Link href="/agent/dispositions">Open disposition queue →</Link>
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
}

export default function AccountabilityPage() {
  return (
    <Suspense fallback={<p className="loading-pulse scc-content">Loading…</p>}>
      <AccountabilityInner />
    </Suspense>
  );
}
