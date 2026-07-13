'use client';

import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Login failed');
      const next = searchParams.get('next') || data.home || '/manager/dashboard';
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(String(err).replace('Error: ', ''));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-atmosphere" aria-hidden="true">
        <div className="auth-glow auth-glow--a" />
        <div className="auth-glow auth-glow--b" />
        <div className="auth-grid" />
      </div>

      <div className="auth-panel">
        <header className="auth-brand">
          <Image
            src="/depmoverslogo.png"
            alt="Dependable Movers"
            width={280}
            height={280}
            priority
            className="auth-logo"
          />
          <p className="auth-tagline">Call Command Center</p>
        </header>

        <form onSubmit={handleSubmit} className="auth-form">
          <h1 className="auth-heading">Sign in</h1>
          <p className="auth-sub">Access your team workspace with your work email.</p>

          <div className="form-group">
            <label htmlFor="email">Work email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@dependablemovers.com"
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          {error && <div className="auth-error" role="alert">{error}</div>}

          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="auth-foot">
          Authorized Dependable Movers staff only
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="auth-page">
          <p className="auth-loading">Loading…</p>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
