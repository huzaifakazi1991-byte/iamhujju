'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Nav } from '@/components/nav';
import { useToast } from '@/components/toast';
import { api } from '@/lib/client';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

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
    <form onSubmit={submit} className="card mx-auto w-full max-w-md p-8">
      <h1 className="text-2xl font-extrabold tracking-tight">Sign in</h1>
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
      </div>
      <p className="mt-6 text-center text-sm text-ink-soft dark:text-white/60">
        No account yet? <Link href="/signup" className="font-semibold text-agent-deep hover:underline dark:text-agent">Sign up</Link>
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen">
      <Nav />
      <main className="hero-glow px-4 py-16 sm:px-6">
        <Suspense fallback={<div className="skeleton mx-auto h-96 w-full max-w-md" />}>
          <LoginForm />
        </Suspense>
      </main>
    </div>
  );
}
