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

function NumCell({
  value,
  onChange,
  ariaLabel,
}: {
  value: number;
  onChange: (n: number) => void;
  ariaLabel: string;
}) {
  return (
    <input
      className="granot-num"
      type="number"
      min={0}
      inputMode="numeric"
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
      onFocus={(e) => e.target.select()}
    />
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

  function renderTable(title: string, list: SheetRow[]) {
    if (list.length === 0) return null;
    return (
      <div className="granot-group">
        <h3 className="granot-group-title">{title}</h3>
        <div className="table-wrap granot-table-wrap">
          <table className="granot-table">
            <thead>
              <tr>
                <th>Agent</th>
                <th className="num">Call</th>
                <th className="num">Email</th>
                <th className="num">Deposit</th>
                <th className="num">Total quotes</th>
              </tr>
            </thead>
            <tbody>
              {list.map((row) => (
                <tr key={row.agentId}>
                  <td className="granot-agent">{row.agentName}</td>
                  <td className="num">
                    <NumCell
                      ariaLabel={`${row.agentName} call quotes`}
                      value={row.quotesCall}
                      onChange={(n) => updateRow(row.agentId, { quotesCall: n })}
                    />
                  </td>
                  <td className="num">
                    <NumCell
                      ariaLabel={`${row.agentName} email quotes`}
                      value={row.quotesEmail}
                      onChange={(n) => updateRow(row.agentId, { quotesEmail: n })}
                    />
                  </td>
                  <td className="num">
                    <NumCell
                      ariaLabel={`${row.agentName} deposits`}
                      value={row.depositsCollected}
                      onChange={(n) => updateRow(row.agentId, { depositsCollected: n })}
                    />
                  </td>
                  <td className="num granot-row-total">{row.quotesCall + row.quotesEmail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <section className="granot-panel">
      <div className="granot-panel-head">
        <div>
          <h2 className="granot-title">Granot entry</h2>
          <p className="granot-sub">
            Enter each agent&apos;s call quotes, email quotes, and deposits for the selected day or week.
          </p>
        </div>
        <p className="granot-summary">
          <span>{totals.call + totals.email} quotes</span>
          <span aria-hidden>·</span>
          <span>{totals.call} call</span>
          <span aria-hidden>·</span>
          <span>{totals.email} email</span>
          <span aria-hidden>·</span>
          <span>{totals.deposits} deposits</span>
        </p>
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
          <span>{periodType === 'week' ? 'Week of' : 'Date'}</span>
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
          {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
        </button>
      </div>

      {message && (
        <p className={`granot-msg ${/fail|error|forbidden/i.test(message) ? 'is-error' : 'is-ok'}`}>
          {message}
        </p>
      )}

      {loading && <p className="loading-pulse">Loading agents…</p>}

      {!loading && (
        <div className="granot-groups">
          {renderTable('Aloware closers', aloware)}
          {renderTable('8x8 closers', x8)}
        </div>
      )}
    </section>
  );
}
