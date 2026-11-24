'use client';

import { useEffect, useState } from 'react';
import { Nav } from '@/components/nav';
import { useToast } from '@/components/toast';
import { api } from '@/lib/client';

type Me = { user: { id: string; email: string; name: string | null; role: string; emailVerified: string | boolean | null } | null };

type WhatsAppState = {
  configured: boolean;
  businessNumber: string;
  verified: boolean;
  phone: string | null;
  verifiedAt: string | null;
  notify: boolean;
  pending: { phone: string; expiresAt: string } | null;
};

type AccountState = { whatsapp?: WhatsAppState; user?: { name: string | null } };

type WaPending = { code: string; link: string; expiresAt: string; businessNumber: string };

export default function SettingsPage() {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [wa, setWa] = useState<WhatsAppState | null>(null);
  const [waPhone, setWaPhone] = useState('');
  const [waBusy, setWaBusy] = useState(false);
  const [waPending, setWaPending] = useState<WaPending | null>(null);

  const loadAccount = () =>
    api<AccountState>('/api/account')
      .then((d) => {
        if (d.user?.name) setName(d.user.name);
        if (d.whatsapp) setWa(d.whatsapp);
      })
      .catch(() => undefined);

  useEffect(() => {
    api<Me>('/api/auth/me')
      .then((d) => {
        if (d.user) { setName(d.user.name ?? ''); setEmail(d.user.email); }
      })
      .catch(() => undefined)
      .finally(() => setLoaded(true));
    void loadAccount();
  }, []);

  // While a verification is pending, poll until the webhook confirms it.
  useEffect(() => {
    if (!wa || wa.verified || !wa.pending) return;
    const t = window.setInterval(() => { void loadAccount(); }, 4000);
    return () => window.clearInterval(t);
  }, [wa]);

  useEffect(() => {
    if (wa?.verified && waPending) { setWaPending(null); toast('WhatsApp connected ✅', 'success'); }
  }, [wa?.verified]); // eslint-disable-line react-hooks/exhaustive-deps

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

  async function patchAccount(payload: Record<string, unknown>) {
    const res = await fetch('/api/account', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) throw new Error(data.error ?? 'Update failed');
  }

  async function startWhatsAppVerify(e: React.FormEvent) {
    e.preventDefault();
    setWaBusy(true);
    try {
      const res = await fetch('/api/account', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ whatsappPhone: waPhone }) });
      const data = (await res.json()) as { error?: string; whatsappPending?: WaPending };
      if (!res.ok) throw new Error(data.error ?? 'Could not start verification');
      if (data.whatsappPending) {
        setWaPending(data.whatsappPending);
        void loadAccount(); // refresh pending state from server
      }
      toast('Code ready — send it from your WhatsApp.', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not start verification', 'error');
    } finally { setWaBusy(false); }
  }

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 mb-8 text-sm text-ink-soft dark:text-white/60">Your account profile.</p>

        <div className="glass mb-6 flex items-center justify-between rounded-2xl px-6 py-4 text-sm">
          <span className="text-ink-soft dark:text-white/60">🎨 Appearance</span>
          <span className="text-xs text-ink-soft dark:text-white/50">Use the 🌙 / ☀️ toggle in the top bar — preference is remembered.</span>
        </div>

        {/* ── WhatsApp notifications ── */}
        <div className="glass card mb-6 p-8">
          <h2 className="text-lg font-bold">💬 WhatsApp notifications</h2>
          <p className="mt-0.5 text-xs text-ink-soft dark:text-white/55">Get every message from the team delivered to your WhatsApp too.</p>

          {wa && !wa.configured && (
            <p className="mt-4 rounded-xl bg-amber/15 px-4 py-3 text-xs text-forest dark:text-cream">
              WhatsApp delivery isn&apos;t connected yet — the admin still needs to set it up. In-app messages always work.
            </p>
          )}

          {wa?.configured && wa.verified && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-xl bg-leaf/10 px-4 py-3">
              <div className="text-sm">
                <p className="font-semibold">✅ Connected — {wa.phone}</p>
                <p className="text-xs text-ink-soft dark:text-white/55">You receive team messages on WhatsApp{wa.notify ? '' : ' · notifications paused'}.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="btn-ghost px-4 py-2 text-xs"
                  disabled={waBusy}
                  onClick={async () => { setWaBusy(true); try { await patchAccount({ whatsappNotify: !wa.notify }); await loadAccount(); } catch (err) { toast(err instanceof Error ? err.message : 'Failed', 'error'); } finally { setWaBusy(false); } }}
                >
                  {wa.notify ? '🔕 Pause' : '🔔 Resume'}
                </button>
                <button
                  className="btn-ghost px-4 py-2 text-xs text-red-600 dark:text-red-400"
                  disabled={waBusy}
                  onClick={async () => { setWaBusy(true); try { await patchAccount({ whatsappDisconnect: true }); await loadAccount(); toast('WhatsApp disconnected.', 'success'); } catch (err) { toast(err instanceof Error ? err.message : 'Failed', 'error'); } finally { setWaBusy(false); } }}
                >
                  Disconnect
                </button>
              </div>
            </div>
          )}

          {wa?.configured && !wa.verified && (wa.pending || waPending) && (
            <div className="mt-4 rounded-xl border border-leaf/40 bg-leaf/10 px-4 py-4 text-sm">
              <p className="font-semibold">1 · Send this code from your WhatsApp</p>
              <p className="mt-1 text-xs text-ink-soft dark:text-white/60">
                To <strong>{waPending?.businessNumber}</strong> — expires in 10 minutes.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <code className="rounded-lg bg-forest px-4 py-2 font-mono text-lg font-bold tracking-[0.3em] text-cream">HJ {waPending?.code}</code>
                <a className="btn-primary px-5 py-2.5 text-xs" href={waPending?.link} target="_blank" rel="noreferrer">📲 Open WhatsApp</a>
              </div>
              <p className="mt-3 text-xs text-ink-soft dark:text-white/55">2 · Tap “Open WhatsApp” (the code is pre-filled) → hit send. This page checks automatically.</p>
            </div>
          )}

          {wa?.configured && !wa.verified && !(wa.pending || waPending) && (
            <form onSubmit={startWhatsAppVerify} className="mt-4 flex flex-wrap items-end gap-3">
              <label className="block min-w-56 flex-1 text-sm font-medium">
                Your WhatsApp number
                <input
                  className="input mt-1.5"
                  value={waPhone}
                  onChange={(e) => setWaPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  inputMode="tel"
                  maxLength={20}
                />
              </label>
              <button className="btn-primary px-6 py-2.5 text-sm" disabled={waBusy || waPhone.trim().length < 8}>
                {waBusy ? 'Creating code…' : 'Connect WhatsApp →'}
              </button>
            </form>
          )}
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
