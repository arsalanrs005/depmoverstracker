'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';

const NAV = [
  { href: '/manager/dashboard', label: 'Executive Dashboard', icon: '◆' },
  { href: '/manager/scoreboard', label: 'Daily Scoreboard', icon: '▦' },
  { href: '/calls', label: 'Call Activity', icon: '☎' },
  { href: '/manager/quotes', label: 'Quote Tracking', icon: '◎' },
  { href: '/agent/dispositions', label: 'Dispositions', icon: '✎' },
  { href: '/manager/accountability', label: 'Accountability', icon: '⚑' },
  { href: '/manager/leaderboard', label: 'Leaderboard', icon: '★' },
];

function isActive(pathname: string, _searchParams: URLSearchParams, href: string) {
  const [base] = href.split('?');
  const onPage = pathname === base || pathname.startsWith(`${base}/`) || (base === '/manager/dashboard' && pathname === '/');
  if (!onPage) return false;

  if (href === '/manager/dashboard') {
    return (
      pathname.startsWith('/manager/dashboard') &&
      pathname !== '/manager/scoreboard' &&
      pathname !== '/manager/quotes'
    );
  }
  return true;
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <div className="scc-app">
      <aside className="scc-sidebar">
        <Link href="/manager/dashboard" className="scc-brand">
          <span className="scc-brand-icon">DM</span>
          <span className="scc-brand-text">
            <strong>Dependable Movers</strong>
            <small>Call Command Center</small>
          </span>
        </Link>
        <nav className="scc-nav">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={isActive(pathname, searchParams, item.href) ? 'scc-nav-link active' : 'scc-nav-link'}
            >
              <span className="scc-nav-icon" aria-hidden>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="scc-sidebar-foot">
          <span className="scc-live-dot" /> Live · Aloware + 8x8
        </div>
      </aside>
      <div className="scc-main">{children}</div>
    </div>
  );
}
