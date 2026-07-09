'use client';

import { useCallback, useEffect, useState } from 'react';
import { CommandHeader } from '@/components/CommandHeader';
import { DISPOSITION_OPTIONS } from '@/lib/cdr-parser';
import { TRACK_LABELS, TRACK_TAB_LABELS, type CallTrack } from '@/lib/tracks';
import { X8X_DISPOSITION_TRACKS, teamForTrack, type X8xDispositionTrack } from '@/lib/track-filters';

type Agent = {
  id: string;
  name: string;
  agent_id_8x8: string | null;
  platform: string;
  team: string | null;
  ring_group: string | null;
};
type CallRow = Record<string, unknown>;

const DISPOSITION_TRACKS = X8X_DISPOSITION_TRACKS;

const GUIDELINES: Record<string, string> = {
  'connected-quoted': 'Confirm you sent a quote. Note price range in notes. Move opp to Quote Given in GHL if not auto-updated.',
  'callback-scheduled': 'Set exact callback date/time. Lead gets reminder SMS 24h before via GHL workflow.',
  'voicemail-left': 'Confirm SMS follow-up will fire. Note what you said in voicemail.',
  'no-answer': 'Use when outbound attempt got no pickup. Triggers light follow-up sequence.',
  'not-interested': 'Lead explicitly declined. Enters low-frequency 30-day re-engagement only.',
  'dnc': 'Permanent — lead asked not to be contacted. Removes from all nurture. Cannot undo without manager.',
};

export default function AgentDispositionsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentId, setAgentId] = useState('');
  const [track, setTrack] = useState<X8xDispositionTrack>('8x8_closer');
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CallRow | null>(null);
  const [dispositionCode, setDispositionCode] = useState('');
  const [notes, setNotes] = useState('');
  const [callbackAt, setCallbackAt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadAgents = useCallback(async () => {
    const team = teamForTrack(track);
    const q = new URLSearchParams({ platform: '8x8' });
    if (team) q.set('team', team);
    const res = await fetch(`/api/agents?${q}`);
    const data = await res.json();
    setAgents(data.agents ?? []);
  }, [track]);
  const loadQueue = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ track });
    if (agentId) params.set('agent_id_8x8', agentId);
    const res = await fetch(`/api/dispositions/pending?${params}`);
    const data = await res.json();
    setCalls(data.calls ?? []);
    setLoading(false);
  }, [agentId, track]);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !dispositionCode) return;
    setSubmitting(true);
    setMessage(null);

    try {
      const res = await fetch('/api/dispositions/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callId: selected.id,
          dispositionCode,
          notes,
          callbackAt: callbackAt || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Submit failed');
      setMessage('Disposition saved' + (data.ghl?.ok ? ' and synced to GHL.' : '.'));
      setSelected(null);
      setDispositionCode('');
      setNotes('');
      setCallbackAt('');
      loadQueue();
    } catch (err) {
      setMessage(`Error: ${err}`);
    } finally {
      setSubmitting(false);
    }
  }

  function fmt(d: unknown) {
    if (!d) return '—';
    return new Date(String(d)).toLocaleString('en-US', { timeZone: 'America/New_York' });
  }

  return (
    <>
      <CommandHeader
        title="Dispositions"
        subtitle="8x8 closers, Verification, and Customer Success — manager logs outcomes here. Aloware closers dispose in Aloware."
      />

      <div className="scc-content">
      <div className="scc-pill-tabs" style={{ marginBottom: '1rem' }}>
        {DISPOSITION_TRACKS.map((tr) => (
          <button
            key={tr}
            type="button"
            className={track === tr ? 'active' : ''}
            title={TRACK_LABELS[tr]}
            onClick={() => {
              setTrack(tr);
              setAgentId('');
              setSelected(null);
            }}
          >
            {TRACK_TAB_LABELS[tr]}
          </button>
        ))}
      </div>

      <div className="card card-highlight form-card" style={{ maxWidth: 360, marginBottom: '1.5rem' }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Filter by agent (optional)</label>
          <select value={agentId} onChange={(e) => setAgentId(e.target.value)}>
            <option value="">All agents on this track</option>
            {agents.map((a) => (
              <option key={a.id} value={a.agent_id_8x8 ?? ''}>
                {a.name} · ext {a.agent_id_8x8}
              </option>
            ))}
          </select>
        </div>
      </div>

      {message && (
        <div className={`card ${message.startsWith('Error') ? 'card-error' : 'card-success'}`}>
          {message}
        </div>
      )}

      <div className={`split-layout ${selected ? 'has-panel' : ''}`}>
        <div>
          <h2 className="section-title">
            Queue <span className="badge pending">{calls.length}</span>
          </h2>
          {loading && <p className="loading-pulse">Loading queue…</p>}
          {!loading && calls.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon">✓</div>
              <p>All caught up — no pending dispositions.</p>
            </div>
          )}
          {calls.map((c) => (
            <div
              key={String(c.id)}
              className={`queue-item ${selected?.id === c.id ? 'selected' : ''}`}
              onClick={() => {
                setSelected(c);
                setDispositionCode('');
                setNotes('');
                setCallbackAt('');
              }}
            >
              <div className="queue-item-name">{String(c.lead_name ?? c.phone)}</div>
              <div className="queue-item-meta">
                {String(c.phone)} · {fmt(c.started_at)}
                {c.agent_name ? ` · ${String(c.agent_name)}` : ''}
                {c.duration_sec ? ` · ${String(c.duration_sec)}s` : ''}
              </div>
              <div className="tag-row">
                <span className="mini-tag">{TRACK_LABELS[c.track as CallTrack] ?? String(c.track)}</span>
                <span className="mini-tag">{String(c.cdr_direction ?? c.source)}</span>
              </div>
            </div>
          ))}
        </div>

        {selected && (
          <div>
            <h2 className="section-title">Dispose call</h2>
            <form onSubmit={handleSubmit} className="card">
              <p style={{ margin: '0 0 1rem' }}>
                <strong style={{ fontSize: '1.1rem', color: 'var(--blue-900)' }}>
                  {String(selected.lead_name ?? selected.phone)}
                </strong>
                <br />
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  {String(selected.phone)} · {fmt(selected.started_at)}
                </span>
              </p>

              <div className="form-group">
                <label>Disposition</label>
                <select
                  value={dispositionCode}
                  onChange={(e) => setDispositionCode(e.target.value)}
                  required
                >
                  <option value="">Select outcome…</option>
                  {DISPOSITION_OPTIONS.map((o) => (
                    <option key={o.code} value={o.code}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              {dispositionCode && (
                <div className="guideline-box">
                  <strong>Guideline</strong>
                  {GUIDELINES[dispositionCode]}
                </div>
              )}

              {dispositionCode === 'callback-scheduled' && (
                <div className="form-group">
                  <label>Callback date & time</label>
                  <input
                    type="datetime-local"
                    value={callbackAt}
                    onChange={(e) => setCallbackAt(e.target.value)}
                    required
                  />
                </div>
              )}

              <div className="form-group">
                <label>Notes (optional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Quote amount, objections, next steps…"
                />
              </div>

              <div className="btn-row">
                <button type="submit" disabled={submitting || !dispositionCode}>
                  {submitting ? 'Saving…' : 'Submit disposition'}
                </button>
                <button type="button" className="secondary" onClick={() => setSelected(null)}>
                  Cancel
                </button>
              </div>
            </form>

            <div className="card guidelines">
              <strong style={{ color: 'var(--blue-900)' }}>All disposition codes</strong>
              {DISPOSITION_OPTIONS.map((o) => (
                <details key={o.code}>
                  <summary>{o.label}</summary>
                  <p style={{ margin: '0.35rem 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    {GUIDELINES[o.code]}
                  </p>
                </details>
              ))}
            </div>
          </div>
        )}
      </div>
      </div>
    </>
  );
}
