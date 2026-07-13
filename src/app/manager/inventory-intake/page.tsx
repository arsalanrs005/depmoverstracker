'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { CommandHeader } from '@/components/CommandHeader';

type Intake = Record<string, unknown>;

function str(v: unknown): string {
  if (v == null) return '';
  return String(v);
}

function display(v: unknown): string {
  const s = str(v).trim();
  return s || '—';
}

function fmt(d: unknown) {
  if (!d) return '—';
  return new Date(String(d)).toLocaleString('en-US', { timeZone: 'America/New_York' });
}

function routeLabel(row: Intake) {
  const from = str(row.pickup_address);
  const to = str(row.dropoff_address);
  if (from && to) return `${from} → ${to}`;
  return from || to || 'Route TBD';
}

function titleFor(row: Intake) {
  const name = str(row.lead_name);
  if (name) return name;
  return routeLabel(row);
}

function Field({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="intake-field">
      <dt>{label}</dt>
      <dd>{display(value)}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="intake-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

export default function InventoryIntakePage() {
  const [intakes, setIntakes] = useState<Intake[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/inventory-intakes');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to load');
      setIntakes(data.intakes ?? []);
    } catch (err) {
      setError(String(err).replace(/^Error:\s*/, ''));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function toggle(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  return (
    <>
      <CommandHeader
        title="After Hour Inventory Intake"
        subtitle="Retell after-hours bot intakes posted from n8n — expand a lead to review move details, inventory, recording, and transcript."
      />

      <div className="scc-content">
        <div className="intake-toolbar">
          <span className="badge pending">{intakes.length} intakes</span>
          <button type="button" className="btn-secondary" onClick={load} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        {error && <div className="card card-error">{error}</div>}
        {loading && !intakes.length && <p className="loading-pulse">Loading intakes…</p>}

        {!loading && !error && intakes.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">◎</div>
            <p>No after-hour inventory intakes yet.</p>
            <p className="empty-state-hint">
              Point n8n at <code>/api/webhooks/inventory-intake</code> to start collecting them.
            </p>
          </div>
        )}

        <div className="intake-list">
          {intakes.map((row) => {
            const id = str(row.id);
            const open = expandedId === id;
            const outcome = str(row.outcome) || 'unknown';

            return (
              <article
                key={id}
                className={`intake-card ${open ? 'open' : ''}`}
              >
                <button
                  type="button"
                  className="intake-card-header"
                  onClick={() => toggle(id)}
                  aria-expanded={open}
                >
                  <div className="intake-card-main">
                    <div className="intake-card-title">{titleFor(row)}</div>
                    <div className="intake-card-meta">
                      {routeLabel(row)}
                      {' · '}
                      {fmt(row.created_at)}
                      {row.home_size ? ` · ${str(row.home_size)}` : ''}
                      {row.move_date ? ` · ${str(row.move_date)}` : ''}
                    </div>
                  </div>
                  <div className="intake-card-side">
                    <span className={`mini-tag outcome-${outcome.replace(/_/g, '-')}`}>
                      {outcome.replace(/_/g, ' ')}
                    </span>
                    {row.lead_sentiment ? (
                      <span className="mini-tag">{str(row.lead_sentiment)}</span>
                    ) : null}
                    <span className="intake-chevron" aria-hidden>
                      {open ? '▾' : '▸'}
                    </span>
                  </div>
                </button>

                {open && (
                  <div className="intake-card-body">
                    <Section title="Lead IDs">
                      <dl className="intake-grid">
                        <Field label="Contact ID" value={row.contact_id} />
                        <Field label="Opportunity ID" value={row.opportunity_id} />
                        <Field label="Retell Call ID" value={row.retell_call_id} />
                        <Field label="Outcome" value={row.outcome} />
                        <Field label="Lead Sentiment" value={row.lead_sentiment} />
                        <Field label="Callback Confirmed" value={row.callback_confirmed} />
                      </dl>
                    </Section>

                    <Section title="Move Details">
                      <dl className="intake-grid">
                        <Field label="Move Date" value={row.move_date} />
                        <Field label="Move Type" value={row.move_type} />
                        <Field label="Home Size" value={row.home_size} />
                        <Field label="Pickup Address" value={row.pickup_address} />
                        <Field label="Dropoff Address" value={row.dropoff_address} />
                        <Field label="Access Notes" value={row.access_notes} />
                        <Field label="Box Count Estimate" value={row.box_count_estimate} />
                        <Field label="Storage Needed" value={row.storage_needed} />
                      </dl>
                    </Section>

                    <Section title="Inventory Breakdown">
                      <dl className="intake-grid">
                        <Field label="Bedroom" value={row.bedroom_contents} />
                        <Field label="Living Room" value={row.living_room_contents} />
                        <Field label="Dining Room" value={row.dining_room_contents} />
                        <Field label="Kitchen" value={row.kitchen_contents} />
                        <Field label="Office" value={row.office_contents} />
                        <Field label="Garage / Outdoor" value={row.garage_outdoor_contents} />
                        <Field label="Special Items" value={row.special_items} />
                      </dl>
                    </Section>

                    <Section title="Call Summary">
                      <p className="intake-prose">{display(row.call_summary)}</p>
                    </Section>

                    <Section title="Recording">
                      {str(row.recording_url) ? (
                        <div className="intake-recording">
                          <audio controls src={str(row.recording_url)} preload="none" />
                          <a
                            href={str(row.recording_url)}
                            target="_blank"
                            rel="noreferrer"
                            className="intake-link"
                          >
                            Open recording
                          </a>
                        </div>
                      ) : (
                        <p className="intake-prose">—</p>
                      )}
                    </Section>

                    <Section title="Full Transcript">
                      <pre className="intake-transcript">{display(row.transcript)}</pre>
                    </Section>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </>
  );
}
