'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Nav } from '@/components/nav';
import { useToast } from '@/components/toast';
import { GoogleButton } from '@/components/google-button';
import { api } from '@/lib/client';

export function SignupForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api<{ user: { role: string } }>('/api/auth/signup', { method: 'POST', body: JSON.stringify({ name, email, password }) });
      toast('Account created. You are on the Free tier!', 'success');
      router.push('/playground');
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Sign-up failed', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="hero-glow px-4 py-16 sm:px-6">
        <form onSubmit={submit} className="card mx-auto w-full max-w-md p-8">
          <h1 className="text-2xl font-bold tracking-tight">Create your account</h1>
          <p className="mt-1 mb-6 text-sm text-ink-soft dark:text-white/60">Free tier includes daily tokens — no card required.</p>
          <div className="flex flex-col gap-4">
            <label className="block text-sm font-medium">
              Name
              <input className="input mt-1.5" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ada Lovelace" autoComplete="name" />
            </label>
            <label className="block text-sm font-medium">
              Email
              <input className="input mt-1.5" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
            </label>
            <label className="block text-sm font-medium">
              Password
              <input className="input mt-1.5" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" autoComplete="new-password" />
            </label>
            <button className="btn-primary mt-2 py-2.5 text-sm" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
            <div className="mt-3 flex items-center gap-3 text-xs uppercase tracking-wide text-ink-soft dark:text-white/40">
              <span className="h-px flex-1 bg-black/10 dark:bg-white/10" />
              or
              <span className="h-px flex-1 bg-black/10 dark:bg-white/10" />
            </div>
            <GoogleButton label="Sign up with Google" />
          </div>
          <p className="mt-6 text-center text-sm text-ink-soft dark:text-white/60">
            Already registered? <Link href="/login" className="font-semibold text-agent-deep hover:underline dark:text-agent">Sign in</Link>
          </p>
        </form>
      </main>
    </div>
  );
}
