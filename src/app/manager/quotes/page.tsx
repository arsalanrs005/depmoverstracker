'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { AlowareQuoteEntry } from '@/components/AlowareQuoteEntry';
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

type Period = 'day' | 'week' | 'month';
type TrackFilter = 'all' | 'aloware_closer' | '8x8_closer';

function QuotesInner() {
  const [period, setPeriod] = useState<Period>('week');
  const [track, setTrack] = useState<TrackFilter>('all');
  const [data, setData] = useState<QuoteTrackingPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
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
  }, [period, track]);

  useEffect(() => {
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [load]);

  const monthMax = Math.max(...(data?.monthlyQuoteValue.map((m) => m.value) ?? [1]), 1);

  return (
    <>
      <CommandHeader
        title="Quote Tracking Dashboard"
        subtitle="Quotes sent, deposits, and agent performance — managers enter Aloware job value at booking time."
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
          </>
        )}

        {!loading && <AlowareQuoteEntry onSaved={load} />}
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
