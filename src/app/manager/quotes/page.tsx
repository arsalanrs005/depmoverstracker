'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { AlowareQuoteEntry } from '@/components/AlowareQuoteEntry';
import { GranotQuoteEntry } from '@/components/GranotQuoteEntry';
import { CommandHeader, FilterSelect } from '@/components/CommandHeader';
import {
  QuoteKpiRow,
  QuoteValueBar,
  QuoteVolumeTrend,
  QuotesVsDepositsChart,
  RevenueByAgentChart,
} from '@/components/QuoteCharts';
import type { QuoteTrackingPayload } from '@/lib/quote-tracking';
import { TRACK_TAB_LABELS } from '@/lib/tracks';
import type { UserRole } from '@/lib/auth-types';

type Period = 'day' | 'week' | 'month';
type TrackFilter = 'all' | 'aloware_closer' | '8x8_closer';

function QuotesInner() {
  const [period, setPeriod] = useState<Period>('week');
  const [track, setTrack] = useState<TrackFilter>('all');
  const [data, setData] = useState<QuoteTrackingPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setRole(data?.user?.role ?? null))
      .catch(() => setRole(null));
  }, []);

  const isAdmin = role === 'admin';
  const isExecutive = role === 'executive';

  const load = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setError(null);
    try {
      const trackQ = track !== 'all' ? `&track=${track}` : '';
      const res = await fetch(`/api/dashboard/quotes?period=${period}${trackQ}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to load');
      setData(json);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [period, track, isAdmin]);

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [load, isAdmin]);

  const monthMax = Math.max(...(data?.monthlyQuoteValue.map((m) => m.value) ?? [1]), 1);

  if (isExecutive) {
    return (
      <>
        <CommandHeader
          title="Quote Entry"
          subtitle="Log Granot day/week totals by agent, or enter job value on quoted Aloware calls."
        />
        <div className="scc-content">
          <GranotQuoteEntry />
          <AlowareQuoteEntry />
        </div>
      </>
    );
  }

  return (
    <>
      <CommandHeader
        title="Quote Tracking Dashboard"
        subtitle="Call Quote, Email Quote, Deposit Collected, and agent performance."
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
              label="Team"
              value={track}
              onChange={(v) => setTrack(v as TrackFilter)}
              options={[
                { value: 'all', label: 'All closers' },
                { value: 'aloware_closer', label: TRACK_TAB_LABELS.aloware_closer },
                { value: '8x8_closer', label: TRACK_TAB_LABELS['8x8_closer'] },
              ]}
            />
          </>
        }
      />

      <div className="scc-content">
        {loading && <p className="loading-pulse">Loading quote metrics…</p>}
        {error && (
          <div className="card card-error">
            {error.includes('DATABASE_URL')
              ? 'Database not connected. Set DATABASE_URL in .env.local.'
              : error}
          </div>
        )}

        {data && !loading && (
          <>
            <QuoteKpiRow summary={data.summary} />

            <div className="scc-chart-grid">
              <div className="scc-panel">
                <p className="scc-chart-label">Quote Volume Trend</p>
                <QuoteVolumeTrend points={data.dailyTrend} />
              </div>
              <div className="scc-panel">
                <p className="scc-chart-label">Quote Volume (Period)</p>
                {data.monthlyQuoteValue.map((m) => (
                  <QuoteValueBar key={m.label} label={m.label} value={m.value} max={monthMax} />
                ))}
              </div>
            </div>

            <div className="scc-chart-grid">
              <div className="scc-panel">
                <p className="scc-chart-label">Quotes by Agent</p>
                <RevenueByAgentChart agents={data.byAgent} />
              </div>
              <div className="scc-panel">
                <p className="scc-chart-label">Quotes vs Deposits</p>
                <QuotesVsDepositsChart agents={data.byAgent} />
              </div>
            </div>

            <p className="sb-legend" style={{ borderRadius: 'var(--radius-sm)', marginTop: '0.5rem' }}>
              {data.dataNote}
            </p>

            <GranotQuoteEntry onSaved={load} />
            <AlowareQuoteEntry onSaved={load} />
          </>
        )}

        {!loading && !data && !error && isAdmin && (
          <>
            <GranotQuoteEntry onSaved={load} />
            <AlowareQuoteEntry onSaved={load} />
          </>
        )}
      </div>
    </>
  );
}

export default function QuotesPage() {
  return (
    <Suspense fallback={<p className="loading-pulse scc-content">Loading…</p>}>
      <QuotesInner />
    </Suspense>
  );
}
