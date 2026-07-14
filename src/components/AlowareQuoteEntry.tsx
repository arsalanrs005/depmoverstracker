'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ALOWARE_DISPOSITIONS, getAlowareDispositionByCode } from '@/lib/aloware-dispositions';
import { formatCurrency } from '@/lib/quote-tracking';

type QuoteCall = {
  id: string;
  phone: string;
  lead_name: string | null;
  agent_name: string | null;
  started_at: string | null;
  disposition_code: string | null;
  wrap_up_code: string | null;
  call_outcome: string;
  quote_type: string | null;
  job_value_cents: number | null;
  move_date: string | null;
  origin_city: string | null;
  destination_city: string | null;
};

type StatusFilter = 'all' | 'quote_track' | string;

function fmtWhen(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-US', { timeZone: 'America/New_York' });
}

function statusLabel(c: QuoteCall): string {
  if (c.wrap_up_code && /[A-Za-z]/.test(c.wrap_up_code) && c.wrap_up_code.includes(' ')) {
    return c.wrap_up_code;
  }
  const mapped = getAlowareDispositionByCode(c.disposition_code);
  if (mapped) return mapped.label;
  if (c.quote_type === 'booked') return 'Booked - Deposit Collected';
  if (c.quote_type === 'booked_pending') return 'Booked - Deposit Pending';
  if (c.quote_type === 'quoted') return 'Quoted';
  return c.disposition_code?.replace(/-/g, ' ') || c.wrap_up_code || 'Unknown';
}

function isQuoteTrack(c: QuoteCall): boolean {
  return (
    c.disposition_code === 'quoted' ||
    c.disposition_code === 'connected-quoted' ||
    c.disposition_code === 'booked-deposit-pending' ||
    c.disposition_code === 'booked-deposit-collected' ||
    c.disposition_code === 'closed-deal' ||
    c.quote_type === 'quoted' ||
    c.quote_type === 'booked_pending' ||
    c.quote_type === 'booked'
  );
}

function statusTone(c: QuoteCall): string {
  if (
    c.quote_type === 'booked' ||
    c.disposition_code === 'booked-deposit-collected' ||
    c.disposition_code === 'closed-deal'
  ) {
    return 'good';
  }
  if (c.quote_type === 'booked_pending' || c.disposition_code === 'booked-deposit-pending') {
    return 'pending';
  }
  if (c.disposition_code === 'quoted' || c.disposition_code === 'connected-quoted' || c.quote_type === 'quoted') {
    return '';
  }
  const mapped = getAlowareDispositionByCode(c.disposition_code);
  if (mapped?.outcome === 'bad') return 'bad';
  if (mapped?.outcome === 'good') return 'good';
  return 'neutral';
}

export function AlowareQuoteEntry({ onSaved }: { onSaved?: () => void }) {
  const [calls, setCalls] = useState<QuoteCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [selected, setSelected] = useState<QuoteCall | null>(null);
  const [quoteType, setQuoteType] = useState<'quoted' | 'booked_pending' | 'booked'>('quoted');
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

  const statusCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of calls) {
      const label = statusLabel(c);
      map.set(label, (map.get(label) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [calls]);

  const visible = useMemo(() => {
    if (filter === 'all') return calls;
    if (filter === 'quote_track') return calls.filter(isQuoteTrack);
    return calls.filter((c) => statusLabel(c) === filter);
  }, [calls, filter]);

  function openForm(c: QuoteCall) {
    setSelected(c);
    setQuoteType(
      c.quote_type === 'booked' || c.disposition_code === 'booked-deposit-collected'
        ? 'booked'
        : c.quote_type === 'booked_pending' || c.disposition_code === 'booked-deposit-pending'
          ? 'booked_pending'
          : 'quoted'
    );
    setJobValue(c.job_value_cents != null ? String(c.job_value_cents / 100) : '');
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

  const quoteTrackCount = calls.filter(isQuoteTrack).length;
  const needsValue = calls.filter((c) => isQuoteTrack(c) && !c.job_value_cents).length;

  return (
    <section className="quote-entry-section aloware-tracker">
      <div className="aloware-tracker-head">
        <div>
          <h2 className="section-title">Aloware tracker</h2>
          <p className="aloware-tracker-sub">
            Live Aloware dispositions from the webhook — Exact status names. Quote-track rows can get a job value.
          </p>
        </div>
        <p className="aloware-tracker-meta">
          {calls.length} calls · {quoteTrackCount} quote-track
          {needsValue > 0 ? ` · ${needsValue} need value` : ''}
        </p>
      </div>

      <div className="aloware-status-bar">
        <button
          type="button"
          className={filter === 'all' ? 'active' : ''}
          onClick={() => setFilter('all')}
        >
          All
        </button>
        <button
          type="button"
          className={filter === 'quote_track' ? 'active' : ''}
          onClick={() => setFilter('quote_track')}
        >
          Quote track
        </button>
        {ALOWARE_DISPOSITIONS.map((d) => {
          const count = statusCounts.find(([label]) => label === d.label)?.[1] ?? 0;
          return (
            <button
              key={d.code}
              type="button"
              className={filter === d.label ? 'active' : ''}
              onClick={() => setFilter(d.label)}
            >
              {d.label}
              {count > 0 ? <span>{count}</span> : null}
            </button>
          );
        })}
      </div>

      {message && (
        <div
          className={`card ${
            message.startsWith('Error') || message.includes('error') ? 'card-error' : 'card-success'
          }`}
          style={{ marginBottom: '1rem' }}
        >
          {message}
        </div>
      )}

      <div className={`split-layout ${selected ? 'has-panel' : ''}`}>
        <div className="table-wrap">
          {loading && <p className="loading-pulse">Loading Aloware calls…</p>}
          {!loading && visible.length === 0 && (
            <div className="empty-state">
              No Aloware dispositions yet for this filter. New statuses appear when agents dispose in Aloware.
            </div>
          )}
          {!loading && visible.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>Lead</th>
                  <th>Agent</th>
                  <th>When</th>
                  <th>Aloware status</th>
                  <th>Job value</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((c) => {
                  const label = statusLabel(c);
                  const canEnter = isQuoteTrack(c);
                  return (
                    <tr key={c.id} className={canEnter && !c.job_value_cents ? 'row-needs-value' : ''}>
                      <td style={{ fontWeight: 600 }}>{c.lead_name ?? c.phone}</td>
                      <td>{c.agent_name ?? '—'}</td>
                      <td>{fmtWhen(c.started_at)}</td>
                      <td>
                        <span className={`badge ${statusTone(c)}`.trim()}>{label}</span>
                      </td>
                      <td>
                        {c.job_value_cents != null
                          ? formatCurrency(c.job_value_cents / 100)
                          : canEnter
                            ? <span className="badge pending">Missing</span>
                            : '—'}
                      </td>
                      <td>
                        {canEnter ? (
                          <button type="button" className="btn-text" onClick={() => openForm(c)}>
                            {c.job_value_cents != null ? 'Edit' : 'Enter'}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
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
                  <br />
                  Status: {statusLabel(selected)}
                </span>
              </p>

              <div className="form-group">
                <label>Status</label>
                <select
                  value={quoteType}
                  onChange={(e) =>
                    setQuoteType(e.target.value as 'quoted' | 'booked_pending' | 'booked')
                  }
                >
                  <option value="quoted">Quoted</option>
                  <option value="booked_pending">Booked - Deposit Pending</option>
                  <option value="booked">Booked - Deposit Collected</option>
                </select>
              </div>

              <div className="form-group">
                <label>Job value ($)</label>
                <div className="input-prefix">
                  <span>$</span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    value={jobValue}
                    onChange={(e) => setJobValue(e.target.value)}
                    placeholder="10800.00"
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
