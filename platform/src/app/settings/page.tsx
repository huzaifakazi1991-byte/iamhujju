'use client';

import { useEffect, useState } from 'react';
import { Nav } from '@/components/nav';
import { useToast } from '@/components/toast';
import { api } from '@/lib/client';

type Me = { user: { id: string; email: string; name: string | null; role: string; emailVerified: string | boolean | null } | null };

export default function SettingsPage() {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Me>('/api/auth/me')
      .then((d) => {
        if (d.user) { setName(d.user.name ?? ''); setEmail(d.user.email); }
      })
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch('/api/account', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Update failed');
      toast('Profile updated.', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Update failed', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-extrabold tracking-tight">Settings</h1>
        <p className="mt-1 mb-8 text-sm text-ink-soft dark:text-white/60">Your account profile.</p>

        <div className="glass mb-6 flex items-center justify-between rounded-2xl px-6 py-4 text-sm">
          <span className="text-ink-soft dark:text-white/60">🎨 Appearance</span>
          <span className="text-xs text-ink-soft dark:text-white/50">Use the 🌙 / ☀️ toggle in the top bar — preference is remembered.</span>
        </div>

        {!loaded && <div className="skeleton h-64" />}
        {loaded && (
          <form onSubmit={save} className="card flex flex-col gap-4 p-8">
            <label className="block text-sm font-medium">
              Name
              <input className="input mt-1.5" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" maxLength={120} />
            </label>
            <label className="block text-sm font-medium">
              Email
              <input className="input mt-1.5" value={email} disabled />
            </label>
            <div>
              <button className="btn-primary px-6 py-2.5 text-sm" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
