'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatCurrency } from '@/lib/quote-tracking';

type QuoteCall = {
  id: string;
  phone: string;
  lead_name: string | null;
  agent_name: string | null;
  started_at: string | null;
  disposition_code: string | null;
  call_outcome: string;
  quote_type: string | null;
  job_value_cents: number | null;
  move_date: string | null;
  origin_city: string | null;
  destination_city: string | null;
};

function fmtWhen(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-US', { timeZone: 'America/New_York' });
}

export function AlowareQuoteEntry({ onSaved }: { onSaved?: () => void }) {
  const [calls, setCalls] = useState<QuoteCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<QuoteCall | null>(null);
  const [quoteType, setQuoteType] = useState<'quoted' | 'booked'>('quoted');
  const [jobValue, setJobValue] = useState('');
  const [moveDate, setMoveDate] = useState('');
  const [originCity, setOriginCity] = useState('');
  const [destinationCity, setDestinationCity] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/quotes/entry');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to load');
      setCalls(data.calls ?? []);
    } catch (e) {
      setMessage(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openForm(c: QuoteCall) {
    setSelected(c);
    setQuoteType(c.quote_type === 'booked' ? 'booked' : 'quoted');
    setJobValue(c.job_value_cents ? String(c.job_value_cents / 100) : '');
    setMoveDate(c.move_date ?? '');
    setOriginCity(c.origin_city ?? '');
    setDestinationCity(c.destination_city ?? '');
    setMessage(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch('/api/quotes/entry', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callId: selected.id,
          quoteType,
          jobValue: Number(jobValue),
          moveDate: moveDate || null,
          originCity,
          destinationCity,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Save failed');
      setMessage('Job details saved.');
      setSelected(null);
      load();
      onSaved?.();
    } catch (err) {
      setMessage(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  const needsEntry = calls.filter((c) => !c.job_value_cents).length;

  return (
    <section className="quote-entry-section">
      <h2 className="section-title">
        Enter quote sent &amp; deposit collected
        {needsEntry > 0 && <span className="badge pending" style={{ marginLeft: '0.5rem' }}>{needsEntry} need value</span>}
      </h2>
      <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginTop: '-0.5rem', marginBottom: '1rem' }}>
        Pick a quoted/booked Aloware call, set status to Quote sent or Deposit collected, and enter the job value.
        That feeds the KPIs above and the scoreboard.
      </p>

      {message && (
        <div className={`card ${message.startsWith('Error') || message.includes('error') ? 'card-error' : 'card-success'}`} style={{ marginBottom: '1rem' }}>
          {message}
        </div>
      )}

      <div className={`split-layout ${selected ? 'has-panel' : ''}`}>
        <div className="table-wrap">
          {loading && <p className="loading-pulse">Loading calls…</p>}
          {!loading && calls.length === 0 && (
            <div className="empty-state">No quoted/booked Aloware calls yet.</div>
          )}
          {!loading && calls.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>Lead</th>
                  <th>Agent</th>
                  <th>When</th>
                  <th>Status</th>
                  <th>Job value</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {calls.map((c) => (
                  <tr key={c.id} className={!c.job_value_cents ? 'row-needs-value' : ''}>
                    <td style={{ fontWeight: 600 }}>{c.lead_name ?? c.phone}</td>
                    <td>{c.agent_name ?? '—'}</td>
                    <td>{fmtWhen(c.started_at)}</td>
                    <td>
                      {c.quote_type === 'booked' ? (
                        <span className="badge good">Deposit collected</span>
                      ) : c.quote_type === 'quoted' ? (
                        <span className="badge">Quote sent</span>
                      ) : (
                        <span className="mini-tag">Needs entry</span>
                      )}
                    </td>
                    <td>
                      {c.job_value_cents
                        ? formatCurrency(c.job_value_cents / 100)
                        : <span className="badge pending">Missing</span>}
                    </td>
                    <td>
                      <button type="button" className="btn-text" onClick={() => openForm(c)}>
                        {c.job_value_cents ? 'Edit' : 'Enter'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {selected && (
          <div className="quote-entry-form-wrap">
            <h3 className="subsection-title">Enter job details</h3>
            <form onSubmit={handleSubmit} className="card quote-entry-form">
              <p style={{ margin: '0 0 1rem' }}>
                <strong style={{ color: 'var(--blue-900)' }}>{selected.lead_name ?? selected.phone}</strong>
                <br />
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  {selected.phone} · {selected.agent_name ?? 'Aloware'} · {fmtWhen(selected.started_at)}
                </span>
              </p>

              <div className="form-group">
                <label>Status</label>
                <select value={quoteType} onChange={(e) => setQuoteType(e.target.value as 'quoted' | 'booked')}>
                  <option value="quoted">Quote sent</option>
                  <option value="booked">Deposit collected</option>
                </select>
              </div>

              <div className="form-group">
                <label>Job value ($)</label>
                <div className="input-prefix">
                  <span>$</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    required
                    value={jobValue}
                    onChange={(e) => setJobValue(e.target.value)}
                    placeholder="10800"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Move date</label>
                <input type="date" value={moveDate} onChange={(e) => setMoveDate(e.target.value)} />
              </div>

              <div className="form-group">
                <label>Origin city</label>
                <input
                  type="text"
                  value={originCity}
                  onChange={(e) => setOriginCity(e.target.value)}
                  placeholder="Seattle, WA"
                />
              </div>

              <div className="form-group">
                <label>Destination city</label>
                <input
                  type="text"
                  value={destinationCity}
                  onChange={(e) => setDestinationCity(e.target.value)}
                  placeholder="Phoenix, AZ"
                />
              </div>

              <div className="btn-row">
                <button type="submit" disabled={submitting}>{submitting ? 'Saving…' : 'Submit'}</button>
                <button type="button" className="secondary" onClick={() => setSelected(null)}>Cancel</button>
              </div>
            </form>
          </div>
        )}
      </div>
    </section>
  );
}
