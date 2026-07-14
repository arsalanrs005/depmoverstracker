/** Helpers for manager-entered Granot quote / deposit totals. */

export type ManualPeriodType = 'day' | 'week';

export type ManualQuoteRowInput = {
  agentId: string;
  quotesCall: number;
  quotesEmail: number;
  depositsCollected: number;
};

/** Monday (UTC calendar date string) for an ISO week containing `dateYmd` (YYYY-MM-DD). */
export function weekStartFromDate(dateYmd: string): string {
  const [y, m, d] = dateYmd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay(); // 0 Sun … 6 Sat
  const diff = day === 0 ? -6 : 1 - day;
  dt.setUTCDate(dt.getUTCDate() + diff);
  return dt.toISOString().slice(0, 10);
}

export function weekEndFromStart(weekStartYmd: string): string {
  const [y, m, d] = weekStartYmd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 6);
  return dt.toISOString().slice(0, 10);
}

/** Today in America/New_York as YYYY-MM-DD. */
export function todayEtYmd(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function formatPeriodLabel(periodType: ManualPeriodType, periodStart: string): string {
  if (periodType === 'day') {
    const [y, m, d] = periodStart.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }
  const end = weekEndFromStart(periodStart);
  const [ys, ms, ds] = periodStart.split('-').map(Number);
  const [ye, me, de] = end.split('-').map(Number);
  const startDt = new Date(Date.UTC(ys, ms - 1, ds));
  const endDt = new Date(Date.UTC(ye, me - 1, de));
  const a = startDt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const b = endDt.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return `Week of ${a} – ${b}`;
}

export function clampNonNegInt(v: unknown): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, 9999);
}
