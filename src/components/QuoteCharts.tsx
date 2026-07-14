'use client';

import {
  formatCount,
  formatCurrency,
  formatPct,
  type QuoteAgentRow,
  type QuoteDailyPoint,
} from '@/lib/quote-tracking';

export function QuoteKpiRow({
  summary,
}: {
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
}) {
  const cards = [
    { label: 'Call Quote', value: formatCount(summary.call_quotes), tone: 'primary' },
    { label: 'Email Quote', value: formatCount(summary.email_quotes), tone: 'accent' },
    { label: 'Deposit Collected', value: formatCount(summary.deposits_collected), tone: 'good' },
    { label: 'Deposit Pending', value: formatCount(summary.deposits_pending) },
    { label: 'Total Quote Value', value: formatCurrency(summary.total_quote_value) },
    { label: 'Revenue Generated', value: formatCurrency(summary.revenue_generated) },
    {
      label: 'Quote-to-Deposit Con. %',
      value: formatPct(summary.quote_to_deposit_pct),
    },
    {
      label: 'Average Quote Value',
      value: summary.avg_quote_value != null ? formatCurrency(summary.avg_quote_value) : '—',
    },
  ];

  return (
    <div className="scc-kpi-row quote-kpi-row">
      {cards.map((c) => (
        <div key={c.label} className={`scc-kpi-card ${c.tone ? `tone-${c.tone}` : ''}`}>
          <div className="scc-kpi-value">{c.value}</div>
          <div className="scc-kpi-label">{c.label}</div>
        </div>
      ))}
    </div>
  );
}

export function QuoteVolumeTrend({ points }: { points: QuoteDailyPoint[] }) {
  if (points.length === 0) {
    return <div className="scc-chart-empty">No quotes in this period.</div>;
  }

  const max = Math.max(...points.map((p) => p.quotes), 1);

  return (
    <div className="quote-volume-chart">
      <div className="quote-volume-bars">
        {points.map((p) => (
          <div key={p.date} className="quote-volume-col" title={`${p.label}: ${p.quotes}`}>
            <div
              className="quote-volume-bar"
              style={{ height: `${Math.max(4, Math.round((p.quotes / max) * 100))}%` }}
            />
            <span className="quote-volume-label">{p.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function QuoteValueBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="quote-month-bar">
      <div className="quote-month-track">
        <div className="quote-month-fill" style={{ width: `${Math.max(pct, value > 0 ? 8 : 0)}%` }} />
      </div>
      <span className="quote-month-label">{label}</span>
      <span className="quote-month-val">{value} quotes</span>
    </div>
  );
}

export function QuotesVsDepositsChart({ agents }: { agents: QuoteAgentRow[] }) {
  const rows = agents.filter((a) => a.quotes_sent > 0 || a.deposits_collected > 0).slice(0, 10);
  if (rows.length === 0) {
    return <div className="scc-chart-empty">No quote or deposit data yet.</div>;
  }

  const max = Math.max(...rows.map((r) => r.quotes_sent + r.deposits_collected), 1);

  return (
    <div className="quote-stacked-chart">
      <div className="quote-stacked-legend">
        <span><i className="swatch quotes" /> Call + Email Quote</span>
        <span><i className="swatch deposits" /> Deposit Collected</span>
      </div>
      {rows.map((r) => {
        const total = r.quotes_sent + r.deposits_collected;
        return (
          <div key={r.agent_name} className="quote-stacked-row">
            <span className="quote-stacked-name">{r.agent_name}</span>
            <div className="quote-stacked-track" style={{ width: `${Math.max(8, Math.round((total / max) * 100))}%` }}>
              <div className="quote-stacked-quotes" style={{ flex: r.quotes_sent || 0.001 }} title={`${r.quotes_sent} quotes`} />
              <div className="quote-stacked-deposits" style={{ flex: r.deposits_collected || 0.001 }} title={`${r.deposits_collected} deposits`} />
            </div>
            <span className="quote-stacked-nums">{r.quotes_sent} / {r.deposits_collected}</span>
          </div>
        );
      })}
    </div>
  );
}

export function RevenueByAgentChart({ agents }: { agents: QuoteAgentRow[] }) {
  const rows = [...agents]
    .filter((a) => a.quotes_sent > 0)
    .sort((a, b) => b.quotes_sent - a.quotes_sent)
    .slice(0, 10);

  if (rows.length === 0) {
    return <div className="scc-chart-empty">No quoted calls in this period.</div>;
  }

  const max = Math.max(...rows.map((r) => r.quotes_sent), 1);

  return (
    <div className="quote-vbar-chart">
      {rows.map((r) => (
        <div key={r.agent_name} className="quote-vbar-col" title={`${r.agent_name}: ${r.quotes_sent}`}>
          <div
            className="quote-vbar-fill"
            style={{ height: `${Math.max(6, Math.round((r.quotes_sent / max) * 100))}%` }}
          />
          <span className="quote-vbar-name">{r.agent_name.split(' ')[0]}</span>
        </div>
      ))}
    </div>
  );
}
