import type { DashboardPeriod } from './db';

export type QuoteAgentRow = {
  agent_name: string;
  quotes_sent: number;
  call_quotes?: number;
  email_quotes?: number;
  deposits_pending?: number;
  deposits_collected: number;
  revenue: number;
};

export type QuoteDailyPoint = {
  date: string;
  label: string;
  quotes: number;
};

export type QuoteTrackingPayload = {
  period: DashboardPeriod;
  trackFilter: string | null;
  summary: {
    call_quotes: number;
    email_quotes: number;
    quotes_sent: number;
    total_quote_value: number;
    deposits_pending: number;
    deposits_collected: number;
    revenue_generated: number;
    quote_to_deposit_pct: number | null;
    avg_quote_value: number | null;
  };
  dailyTrend: QuoteDailyPoint[];
  monthlyQuoteValue: { label: string; value: number }[];
  byAgent: QuoteAgentRow[];
  dataNote: string;
};

export function formatCurrency(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function formatPct(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const capped = Math.min(Math.max(n, 0), 100);
  return `${capped.toFixed(2)}%`;
}

export function formatCount(n: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  }).format(n);
}
