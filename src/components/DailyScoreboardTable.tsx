'use client';

import {
  SCOREBOARD_DAY_LABELS,
  formatRevenue,
  type ScoreboardPayload,
} from '@/lib/scoreboard-week';

function MetricCells({ leads, deals, revenue }: { leads: number; deals: number; revenue: number }) {
  return (
    <>
      <td className="sb-leads">{leads}</td>
      <td className="sb-deals">{deals}</td>
      <td className="sb-revenue">{formatRevenue(revenue)}</td>
    </>
  );
}

export function DailyScoreboardTable({ data }: { data: ScoreboardPayload }) {
  return (
    <div className="sb-wrap">
      <div className="sb-meta">
        <span className="sb-week-badge">{data.weekLabel}</span>
        <span>{data.weekRangeLabel} · Resets every Monday (ET)</span>
      </div>

      <div className="sb-scroll">
        <table className="sb-table">
          <thead>
            <tr className="sb-row-day">
              <th rowSpan={2} className="sb-agent-col">Agent</th>
              {data.days.map((d) => (
                <th key={d} colSpan={3} className="sb-day-head">
                  {SCOREBOARD_DAY_LABELS[d].toUpperCase()}
                </th>
              ))}
              <th colSpan={3} className="sb-day-head sb-total-head">TOTAL</th>
            </tr>
            <tr className="sb-row-metric">
              {data.days.map((d) => (
                <MetricHeaders key={d} />
              ))}
              <MetricHeaders />
            </tr>
          </thead>
          <tbody>
            {data.agents.map((agent) => (
              <tr key={agent.agent_name}>
                <th className="sb-agent-name">{agent.agent_name}</th>
                {data.days.map((d) => (
                  <MetricCells key={d} {...agent.days[d]} />
                ))}
                <MetricCells {...agent.totals} />
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="sb-row-total">
              <th>TOTAL</th>
              {data.days.map((d) => (
                <MetricCells key={d} {...data.dayTotals[d]} />
              ))}
              <MetricCells {...data.grandTotal} />
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="sb-legend">
        Leads = calls handled · Deals = quoted · $ = manager-entered job value
      </p>
    </div>
  );
}

function MetricHeaders() {
  return (
    <>
      <th className="sb-metric sb-leads-head">Leads</th>
      <th className="sb-metric sb-deals-head">Deals</th>
      <th className="sb-metric sb-revenue-head">$</th>
    </>
  );
}
