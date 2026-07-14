'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getAlowareDispositionByCode } from '@/lib/aloware-dispositions';
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

type StatusFilter = 'all' | 'quoted' | 'booked_pending' | 'booked';

const QUOTE_FILTERS: Array<{ key: StatusFilter; label: string }> = [
  { key: 'all', label: 'All quote statuses' },
  { key: 'quoted', label: 'Quoted' },
  { key: 'booked_pending', label: 'Booked - Deposit Pending' },
  { key: 'booked', label: 'Booked - Deposit Collected' },
];

function fmtWhen(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-US', { timeZone: 'America/New_York' });
}

function bucket(c: QuoteCall): 'quoted' | 'booked_pending' | 'booked' | null {
  if (
    c.quote_type === 'booked' ||
    c.disposition_code === 'booked-deposit-collected' ||
    c.disposition_code === 'closed-deal'
  ) {
    return 'booked';
  }
  if (
    c.quote_type === 'booked_pending' ||
    c.disposition_code === 'booked-deposit-pending'
  ) {
    return 'booked_pending';
  }
  if (
    c.quote_type === 'quoted' ||
    c.disposition_code === 'quoted' ||
    c.disposition_code === 'connected-quoted'
  ) {
    return 'quoted';
  }
  return null;
}

function statusLabel(c: QuoteCall): string {
  const b = bucket(c);
  if (b === 'booked') return 'Booked - Deposit Collected';
  if (b === 'booked_pending') return 'Booked - Deposit Pending';
  if (b === 'quoted') return 'Quoted';

  const mapped = getAlowareDispositionByCode(c.disposition_code);
  if (mapped) return mapped.label;
  if (c.wrap_up_code && /[A-Za-z ]/.test(c.wrap_up_code) && c.wrap_up_code.includes(' ')) {
    return c.wrap_up_code;
  }
  return 'Quoted';
}

function statusTone(c: QuoteCall): string {
  const b = bucket(c);
  if (b === 'booked') return 'good';
  if (b === 'booked_pending') return 'pending';
  return '';
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
      setCalls((data.calls ?? []).filter((c: QuoteCall) => bucket(c) != null));
    } catch (e) {
      setMessage(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    const next = { quoted: 0, booked_pending: 0, booked: 0 };
    for (const c of calls) {
      const b = bucket(c);
      if (b) next[b] += 1;
    }
    return next;
  }, [calls]);

  const visible = useMemo(() => {
    if (filter === 'all') return calls;
    return calls.filter((c) => bucket(c) === filter);
  }, [calls, filter]);

  function openForm(c: QuoteCall) {
    setSelected(c);
    setQuoteType(bucket(c) ?? 'quoted');
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

  const needsValue = calls.filter((c) => !c.job_value_cents).length;

  return (
    <section className="quote-entry-section aloware-tracker">
      <div className="aloware-tracker-head">
        <div>
          <h2 className="section-title">Aloware quote entry</h2>
          <p className="aloware-tracker-sub">
            Only Quoted, Booked - Deposit Pending, and Booked - Deposit Collected from Aloware.
            Enter job value when needed.
          </p>
        </div>
        <p className="aloware-tracker-meta">
          {counts.quoted} quoted · {counts.booked_pending} pending · {counts.booked} collected
          {needsValue > 0 ? ` · ${needsValue} need value` : ''}
        </p>
      </div>

      <div className="aloware-status-bar">
        {QUOTE_FILTERS.map((f) => {
          const count =
            f.key === 'all'
              ? calls.length
              : f.key === 'quoted'
                ? counts.quoted
                : f.key === 'booked_pending'
                  ? counts.booked_pending
                  : counts.booked;
          return (
            <button
              key={f.key}
              type="button"
              className={filter === f.key ? 'active' : ''}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
              <span>{count}</span>
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
          {loading && <p className="loading-pulse">Loading Aloware quotes…</p>}
          {!loading && visible.length === 0 && (
            <div className="empty-state">
              No Quoted / Deposit Pending / Deposit Collected calls yet from Aloware.
            </div>
          )}
          {!loading && visible.length > 0 && (
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
                {visible.map((c) => (
                  <tr key={c.id} className={!c.job_value_cents ? 'row-needs-value' : ''}>
                    <td style={{ fontWeight: 600 }}>{c.lead_name ?? c.phone}</td>
                    <td>{c.agent_name ?? '—'}</td>
                    <td>{fmtWhen(c.started_at)}</td>
                    <td>
                      <span className={`badge ${statusTone(c)}`.trim()}>{statusLabel(c)}</span>
                    </td>
                    <td>
                      {c.job_value_cents != null
                        ? formatCurrency(c.job_value_cents / 100)
                        : <span className="badge pending">Missing</span>}
                    </td>
                    <td>
                      <button type="button" className="btn-text" onClick={() => openForm(c)}>
                        {c.job_value_cents != null ? 'Edit' : 'Enter'}
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
