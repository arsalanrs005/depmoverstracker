import Link from 'next/link';

export default function HomePage() {
  return (
    <>
      <section className="hero">
        <span className="hero-badge">Live · Aloware + 8x8 + Retell + GHL</span>
        <h1>Dual-stack call tracking</h1>
        <p>
          Aloware closers self-dispose (webhook). 8x8 closers, Verification, and CS use manager
          dispositions. All 8x8 CDR metrics sync every 5 minutes.
        </p>
      </section>

      <div className="feature-grid">
        <Link href="/agent/dispositions" className="card card-link">
          <div className="card-icon">📋</div>
          <p className="card-title">Manager Dispositions</p>
          <p className="card-desc">8x8 closers, Verification, CS — manager queue with guided codes and GHL sync.</p>
        </Link>
        <Link href="/manager/dashboard" className="card card-link">
          <div className="card-icon">📊</div>
          <p className="card-title">Manager Dashboard</p>
          <p className="card-desc">By track: Aloware closers, 8x8, Verification, CS — auto-refreshes every 5 min.</p>
        </Link>
        <Link href="/calls" className="card card-link">
          <div className="card-icon">📞</div>
          <p className="card-title">All Calls</p>
          <p className="card-desc">Aloware + Retell + 8x8 CDR — full call history with track labels.</p>
        </Link>
        <Link href="/import" className="card card-link">
          <div className="card-icon">⬆️</div>
          <p className="card-title">Import CDR</p>
          <p className="card-desc">CSV backfill for historical data. Ongoing sync via 8x8 Work API.</p>
        </Link>
      </div>

      <h2 className="section-title">Quick links</h2>
      <div className="card card-flat">
        <div className="tag-row">
          <a href="/api/health" className="mini-tag">Health</a>
          <a href="/api/calls" className="mini-tag">Calls API</a>
          <a href="/api/dashboard/stats?period=day" className="mini-tag">Stats API</a>
        </div>
      </div>
    </>
  );
}
