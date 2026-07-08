import { listRecentCalls } from '@/lib/db';
import { TRACK_LABELS, type CallTrack } from '@/lib/tracks';

export const dynamic = 'force-dynamic';

function fmt(d: unknown) {
  if (!d) return '—';
  return new Date(String(d)).toLocaleString('en-US', { timeZone: 'America/New_York' });
}

function outcomeBadge(outcome: string) {
  return <span className={`badge ${outcome}`}>{outcome}</span>;
}

function sourceLabel(source: string) {
  if (source === '8x8_inbound') return '8x8 Inbound';
  if (source === '8x8_outbound') return '8x8 Outbound';
  if (source === 'aloware_inbound') return 'Aloware Inbound';
  if (source === 'aloware_outbound') return 'Aloware Outbound';
  if (source === 'retell') return 'Retell AI';
  return source;
}

export default async function CallsPage() {
  let calls: Record<string, unknown>[] = [];
  let error: string | null = null;

  try {
    calls = (await listRecentCalls(100)) as Record<string, unknown>[];
  } catch (e) {
    error = String(e);
  }

  return (
    <>
      <header className="page-header">
        <h1 className="page-title">Recent Calls</h1>
        <p className="page-subtitle">
          {calls.length} calls — Aloware closers, 8x8 (sync every 5 min), Retell AI.
        </p>
      </header>

      {error && (
        <div className="card card-error">
          Database not connected. Set DATABASE_URL and run <code>npm run db:push</code>.
        </div>
      )}

      {!error && calls.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">📞</div>
          <p>No calls yet. Run the 8x8 API sync or import a CDR CSV.</p>
        </div>
      )}

      {calls.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Track</th>
                <th>Phone</th>
                <th>Lead</th>
                <th>Source</th>
                <th>Agent</th>
                <th>Outcome</th>
                <th>Disposition</th>
                <th>Pending</th>
              </tr>
            </thead>
            <tbody>
              {calls.map((c) => (
                <tr key={String(c.id)}>
                  <td>{fmt(c.started_at ?? c.created_at)}</td>
                  <td><span className="mini-tag">{TRACK_LABELS[c.track as CallTrack] ?? String(c.track ?? '—')}</span></td>
                  <td style={{ fontWeight: 600 }}>{String(c.phone)}</td>
                  <td>{String(c.lead_name ?? '—')}</td>
                  <td><span className="mini-tag">{sourceLabel(String(c.source))}</span></td>
                  <td>{String(c.agent_name ?? '—')}</td>
                  <td>{outcomeBadge(String(c.call_outcome))}</td>
                  <td>{String(c.disposition_code ?? '—')}</td>
                  <td>
                    {c.needs_disposition && !c.disposition_code ? (
                      <span className="badge pending">Yes</span>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
