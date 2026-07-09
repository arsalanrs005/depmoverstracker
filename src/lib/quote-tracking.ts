import type { DashboardPeriod } from './db';

export type QuoteAgentRow = {
  agent_name: string;
  quotes_sent: number;
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
    quotes_sent: number;
    total_quote_value: number;
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
  if (n <= 0) return '$0';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatPct(n: number | null): string {
  if (n == null) return '—';
  return `${n.toFixed(2)}%`;
}
