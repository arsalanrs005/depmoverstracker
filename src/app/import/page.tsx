'use client';

import Link from 'next/link';
import { useState } from 'react';

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);

    const form = new FormData();
    form.append('file', file);

    try {
      const res = await fetch('/api/imports/8x8-cdr', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Import failed');
      setResult(data);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <header className="page-header">
        <h1 className="page-title">Import CDR</h1>
        <p className="page-subtitle">
          Upload 8x8 Call Detail Records for one-time backfill. Day-to-day sync runs automatically
          via the Work Analytics API every 5 minutes.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="card form-card">
        <div className="upload-zone">
          <p style={{ margin: 0, fontWeight: 600, color: 'var(--blue-900)' }}>
            Drop your CSV here
          </p>
          <p style={{ margin: '0.35rem 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Call_Records export from Analytics for 8x8 Work
          </p>
          <input
            id="csv"
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {file && (
            <p style={{ marginTop: '0.75rem', fontSize: '0.85rem', fontWeight: 600 }}>
              Selected: {file.name}
            </p>
          )}
        </div>
        <div className="btn-row" style={{ marginTop: '1.25rem' }}>
          <button type="submit" disabled={!file || loading}>
            {loading ? 'Importing…' : 'Import CSV'}
          </button>
        </div>
      </form>

      {error && (
        <div className="card card-error">
          <strong>Error</strong>
          <p style={{ margin: '0.5rem 0 0' }}>{error}</p>
        </div>
      )}

      {result && (
        <div className="card card-success">
          <strong style={{ fontSize: '1.05rem' }}>Import complete</strong>
          <div className="result-stats">
            <div className="result-stat">
              <div className="num">{String(result.parsed)}</div>
              <div className="lbl">Parsed</div>
            </div>
            <div className="result-stat">
              <div className="num">{String(result.inserted)}</div>
              <div className="lbl">Inserted</div>
            </div>
            <div className="result-stat">
              <div className="num">{String(result.skipped)}</div>
              <div className="lbl">Skipped</div>
            </div>
          </div>
          <p style={{ marginTop: '1.25rem', marginBottom: 0 }}>
            <Link href="/agent/dispositions">View disposition queue →</Link>
          </p>
        </div>
      )}
    </>
  );
}
