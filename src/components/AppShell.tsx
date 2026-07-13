'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { SessionUser } from '@/lib/auth-types';
import { defaultHomeForRole, roleLabel } from '@/lib/auth-types';

const ADMIN_NAV = [
  { href: '/manager/dashboard', label: 'Executive Dashboard', icon: '◆' },
  { href: '/manager/scoreboard', label: 'Daily Scoreboard', icon: '▦' },
  { href: '/calls', label: 'Call Activity', icon: '☎' },
  { href: '/manager/quotes', label: 'Quote Tracking', icon: '◎' },
  { href: '/manager/inventory-intake', label: 'After Hour Inventory', icon: '☰' },
  { href: '/manager/accountability', label: 'Accountability', icon: '⚑' },
  { href: '/manager/leaderboard', label: 'Leaderboard', icon: '★' },
];

const EXECUTIVE_NAV = [
  { href: '/agent/dispositions', label: 'Dispositions', icon: '✎' },
  { href: '/manager/quotes', label: 'Quote Entry', icon: '◎' },
  { href: '/manager/inventory-intake', label: 'After Hour Inventory', icon: '☰' },
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
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    if (pathname === '/login') return;
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setUser(data?.user ?? null))
      .catch(() => setUser(null));
  }, [pathname]);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  if (pathname === '/login') {
    return <>{children}</>;
  }

  const nav = user?.role === 'executive' ? EXECUTIVE_NAV : ADMIN_NAV;
  const home = user ? defaultHomeForRole(user.role) : '/manager/dashboard';

  return (
    <div className="scc-app">
      <aside className="scc-sidebar">
        <Link href={home} className="scc-brand">
          <span className="scc-brand-icon">DM</span>
          <span className="scc-brand-text">
            <strong>Dependable Movers</strong>
            <small>Call Command Center</small>
          </span>
        </Link>
        <nav className="scc-nav">
          {nav.map((item) => (
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
          {user ? (
            <div className="scc-user-block">
              <span className="scc-user-name">{user.name}</span>
              <span className="scc-user-role">{roleLabel(user.role)}</span>
              <button type="button" className="scc-logout" onClick={logout}>
                Sign out
              </button>
            </div>
          ) : (
            <>
              <span className="scc-live-dot" /> Live · Aloware + 8x8
            </>
          )}
        </div>
      </aside>
      <div className="scc-main">{children}</div>
    </div>
  );
}
