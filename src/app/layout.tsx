import { Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import { NavBar } from '@/components/NavBar';
import type { ReactNode } from 'react';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata = {
  title: 'UGVL Call Tracker',
  description: 'Dual-stack call tracker — Aloware closers + 8x8 Verification/CS + Retell + GHL',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={jakarta.variable}>
      <body>
        <NavBar />
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
