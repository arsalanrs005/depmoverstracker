'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { CommandHeader, FilterSelect } from '@/components/CommandHeader';
import { DailyScoreboardTable } from '@/components/DailyScoreboardTable';
import type { ScoreboardPayload } from '@/lib/scoreboard-week';

type TeamFilter = 'all' | 'aloware' | '8x8';

function ScoreboardInner() {
  const [team, setTeam] = useState<TeamFilter>('all');
  const [data, setData] = useState<ScoreboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard/scoreboard?team=${team}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to load');
      setData(json);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [team]);

  useEffect(() => {
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <>
      <CommandHeader
        title="Daily Scoreboard"
        subtitle="Monday–Saturday agent grid for the current week. Totals roll up through Saturday; board resets each Monday (Eastern)."
        filters={
          <FilterSelect
            label="Team"
            value={team}
            onChange={(v) => setTeam(v as TeamFilter)}
            options={[
              { value: 'all', label: 'All closers' },
              { value: 'aloware', label: 'Aloware closers' },
              { value: '8x8', label: '8x8 closers' },
            ]}
          />
        }
      />

      <div className="scc-content">
        {loading && <p className="loading-pulse">Loading scoreboard…</p>}
        {error && (
          <div className="card card-error">
            {error.includes('DATABASE_URL')
              ? 'Database not connected. Set DATABASE_URL in .env.local.'
              : error}
          </div>
        )}
        {data && !loading && <DailyScoreboardTable data={data} />}
      </div>
    </>
  );
}

export default function ScoreboardPage() {
  return (
    <Suspense fallback={<p className="loading-pulse scc-content">Loading scoreboard…</p>}>
      <ScoreboardInner />
    </Suspense>
  );
}
