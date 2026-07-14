'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { todayEtYmd, type ManualPeriodType } from '@/lib/quote-manual';

type SheetRow = {
  agentId: string;
  agentName: string;
  platform: string;
  team: string | null;
  quotesCall: number;
  quotesEmail: number;
  depositsCollected: number;
};

function Stepper({
  label,
  value,
  onChange,
  accent,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  accent?: 'call' | 'email' | 'deposit';
}) {
  return (
    <div className={`granot-stepper ${accent ? `accent-${accent}` : ''}`}>
      <span className="granot-stepper-label">{label}</span>
      <div className="granot-stepper-controls">
        <button
          type="button"
          className="granot-step-btn"
          aria-label={`Decrease ${label}`}
          onClick={() => onChange(Math.max(0, value - 1))}
        >
          −
        </button>
        <input
          className="granot-step-input"
          type="number"
          min={0}
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
        />
        <button
          type="button"
          className="granot-step-btn"
          aria-label={`Increase ${label}`}
          onClick={() => onChange(value + 1)}
        >
          +
        </button>
      </div>
    </div>
  );
}

export function GranotQuoteEntry({ onSaved }: { onSaved?: () => void }) {
  const [periodType, setPeriodType] = useState<ManualPeriodType>('day');
  const [date, setDate] = useState(todayEtYmd());
  const [rows, setRows] = useState<SheetRow[]>([]);
  const [label, setLabel] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const q = new URLSearchParams({ periodType, date });
      const res = await fetch(`/api/quotes/manual?${q}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to load');
      setRows(data.rows ?? []);
      setLabel(data.label ?? '');
      setDirty(false);
    } catch (err) {
      setMessage(String(err).replace(/^Error:\s*/, ''));
    } finally {
      setLoading(false);
    }
  }, [periodType, date]);

  useEffect(() => {
    load();
  }, [load]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => ({
        call: acc.call + r.quotesCall,
        email: acc.email + r.quotesEmail,
        deposits: acc.deposits + r.depositsCollected,
      }),
      { call: 0, email: 0, deposits: 0 }
    );
  }, [rows]);

  function updateRow(agentId: string, patch: Partial<SheetRow>) {
    setRows((prev) => prev.map((r) => (r.agentId === agentId ? { ...r, ...patch } : r)));
    setDirty(true);
    setMessage(null);
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/quotes/manual', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          periodType,
          date,
          rows: rows.map((r) => ({
            agentId: r.agentId,
            quotesCall: r.quotesCall,
            quotesEmail: r.quotesEmail,
            depositsCollected: r.depositsCollected,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Save failed');
      setMessage(`Saved ${data.saved} agents for ${data.label}.`);
      setDirty(false);
      onSaved?.();
    } catch (err) {
      setMessage(String(err).replace(/^Error:\s*/, ''));
    } finally {
      setSaving(false);
    }
  }

  const aloware = rows.filter((r) => r.platform === 'aloware');
  const x8 = rows.filter((r) => r.platform === '8x8');

  return (
    <section className="granot-panel">
      <div className="granot-panel-head">
        <div>
          <p className="granot-kicker">From Granot → here</p>
          <h2 className="granot-title">Log quotes &amp; deposits by agent</h2>
          <p className="granot-sub">
            Open Granot, then tap the numbers for each agent — Call quotes, Email quotes, and Deposits.
            Save once when you&apos;re done.
          </p>
        </div>
        <div className="granot-totals">
          <div>
            <strong>{totals.call + totals.email}</strong>
            <span>Quotes</span>
          </div>
          <div>
            <strong>{totals.call}</strong>
            <span>Call</span>
          </div>
          <div>
            <strong>{totals.email}</strong>
            <span>Email</span>
          </div>
          <div>
            <strong>{totals.deposits}</strong>
            <span>Deposits</span>
          </div>
        </div>
      </div>

      <div className="granot-toolbar">
        <div className="granot-segment" role="group" aria-label="Period type">
          <button
            type="button"
            className={periodType === 'day' ? 'active' : ''}
            onClick={() => setPeriodType('day')}
          >
            Day
          </button>
          <button
            type="button"
            className={periodType === 'week' ? 'active' : ''}
            onClick={() => setPeriodType('week')}
          >
            Week
          </button>
        </div>

        <label className="granot-date">
          <span>{periodType === 'week' ? 'Any day in week' : 'Date'}</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value || todayEtYmd())}
          />
        </label>

        <p className="granot-period-label">{label || '—'}</p>

        <button
          type="button"
          className="granot-save"
          disabled={saving || loading || !dirty}
          onClick={handleSave}
        >
          {saving ? 'Saving…' : dirty ? 'Save all' : 'Saved'}
        </button>
      </div>

      {message && (
        <div
          className={`card ${
            /fail|error|forbidden/i.test(message) ? 'card-error' : 'card-success'
          }`}
          style={{ marginBottom: '1rem' }}
        >
          {message}
        </div>
      )}

      {loading && <p className="loading-pulse">Loading agents…</p>}

      {!loading && (
        <div className="granot-groups">
          {[
            { key: 'aloware', title: 'Aloware closers', list: aloware },
            { key: '8x8', title: '8x8 closers', list: x8 },
          ].map((group) =>
            group.list.length === 0 ? null : (
              <div key={group.key} className="granot-group">
                <h3 className="granot-group-title">{group.title}</h3>
                <div className="granot-cards">
                  {group.list.map((row) => (
                    <article key={row.agentId} className="granot-agent-card">
                      <div className="granot-agent-name">{row.agentName}</div>
                      <div className="granot-agent-fields">
                        <Stepper
                          label="Call"
                          accent="call"
                          value={row.quotesCall}
                          onChange={(n) => updateRow(row.agentId, { quotesCall: n })}
                        />
                        <Stepper
                          label="Email"
                          accent="email"
                          value={row.quotesEmail}
                          onChange={(n) => updateRow(row.agentId, { quotesEmail: n })}
                        />
                        <Stepper
                          label="Deposit"
                          accent="deposit"
                          value={row.depositsCollected}
                          onChange={(n) => updateRow(row.agentId, { depositsCollected: n })}
                        />
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            )
          )}
        </div>
      )}
    </section>
  );
}
