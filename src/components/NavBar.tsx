'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Home' },
  { href: '/agent/dispositions', label: 'Dispositions' },
  { href: '/manager/dashboard', label: 'Dashboard' },
  { href: '/calls', label: 'Calls' },
  { href: '/import', label: 'Import' },
];

export function NavBar() {
  const pathname = usePathname();

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link href="/" className="brand">
          <span className="brand-mark">CT</span>
          <span className="brand-text">
            <strong>Call Tracker</strong>
            <small>Dependable Movers</small>
          </span>
        </Link>
        <nav className="nav-links">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={pathname === link.href ? 'nav-link active' : 'nav-link'}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
