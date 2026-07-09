import { Suspense } from 'react';
import { Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import { AppShell } from '@/components/AppShell';
import type { ReactNode } from 'react';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata = {
  title: 'Dependable Movers · Call Command Center',
  description: 'Sales Command Center — Aloware closers + 8x8 Verification/CS call tracking',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={jakarta.variable}>
      <body>
        <Suspense fallback={null}>
          <AppShell>{children}</AppShell>
        </Suspense>
      </body>
    </html>
  );
}
