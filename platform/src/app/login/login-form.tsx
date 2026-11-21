'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Nav } from '@/components/nav';
import { useToast } from '@/components/toast';
import { GoogleButton } from '@/components/google-button';
import { api } from '@/lib/client';

function LoginFormInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const err = params.get('error');
    if (err === 'google_not_configured') toast('Google sign-in is not configured yet.', 'error');
    else if (err === 'oauth_state') toast('Google sign-in session expired. Please try again.', 'error');
    else if (err === 'google_failed') toast('Could not complete Google sign-in. Please try again.', 'error');
    else if (err === 'suspended') toast('This account is suspended. Contact support.', 'error');
  }, [params, toast]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api<{ user: { role: string } }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      toast('Signed in. Welcome back!', 'success');
      const next = params.get('next');
      router.push(next ?? (res.user.role === 'ADMIN' ? '/admin' : '/playground'));
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Sign-in failed', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="hero-glow px-4 py-16 sm:px-6">
        <form onSubmit={submit} className="card mx-auto w-full max-w-md p-8">
          <h1 className="text-2xl font-bold tracking-tight">Sign in</h1>
          <p className="mt-1 mb-6 text-sm text-ink-soft dark:text-white/60">Welcome back to IamHujju.</p>
          <div className="flex flex-col gap-4">
            <label className="block text-sm font-medium">
              Email
              <input className="input mt-1.5" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
            </label>
            <label className="block text-sm font-medium">
              Password
              <input className="input mt-1.5" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
            </label>
            <button className="btn-primary mt-2 py-2.5 text-sm" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
            <div className="mt-3 flex items-center gap-3 text-xs uppercase tracking-wide text-ink-soft dark:text-white/40">
              <span className="h-px flex-1 bg-black/10 dark:bg-white/10" />
              or
              <span className="h-px flex-1 bg-black/10 dark:bg-white/10" />
            </div>
            <GoogleButton label="Continue with Google" />
          </div>
          <p className="mt-6 text-center text-sm text-ink-soft dark:text-white/60">
            No account yet? <Link href="/signup" className="font-semibold text-agent-deep hover:underline dark:text-agent">Sign up</Link>
          </p>
        </form>
      </main>
    </div>
  );
}

export function LoginForm() {
  return (
    <Suspense fallback={<div className="skeleton mx-auto h-96 w-full max-w-md" />}>
      <LoginFormInner />
    </Suspense>
  );
}
