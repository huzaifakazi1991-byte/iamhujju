'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Nav } from '@/components/nav';
import { useToast } from '@/components/toast';
import { api, ApiError } from '@/lib/client';
import { motion } from 'framer-motion';

type Profile = {
  id: string; email: string; name: string | null; role: string; emailVerified: boolean; memberSince: string;
  birthday: string | null; country: string | null; bio: string | null; avatarUrl: string | null;
};
type Plan = { slug: string; name: string; dailyTokens: number; monthlyTokens: number; isFree: boolean } | null;
type Payment = { id: string; amount: number; currency: string; status: string; tokensGranted: number | null; createdAt: string };
type AccountData = { profile: Profile; plan: Plan; tokens: { available: number; lifetimeUsed: number }; payments: Payment[] };

export default function ProfilePage() {
  const { toast } = useToast();
  const [data, setData] = useState<AccountData | null>(null);
  const [name, setName] = useState('');
  const [birthday, setBirthday] = useState('');
  const [country, setCountry] = useState('');
  const [bio, setBio] = useState('');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api<AccountData>('/api/account')
      .then((d) => {
        setData(d);
        setName(d.profile.name ?? '');
        setBirthday(d.profile.birthday ? d.profile.birthday.slice(0, 10) : '');
        setCountry(d.profile.country ?? '');
        setBio(d.profile.bio ?? '');
        setAvatar(d.profile.avatarUrl);
      })
      .catch((err) => toast(err instanceof Error ? err.message : 'Could not load profile', 'error'));
  }, [toast]);

  async function pickAvatar(file: File) {
    if (!file.type.startsWith('image/')) { toast('Please choose an image file.', 'error'); return; }
    const img = new Image();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Could not read file'));
      reader.readAsDataURL(file);
    });
    img.src = dataUrl;
    await new Promise((r) => { img.onload = r; img.onerror = r; });
    const canvas = document.createElement('canvas');
    const size = Math.min(img.width, img.height, 512);
    canvas.width = 256; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const sx = (img.width - size) / 2, sy = (img.height - size) / 2;
    ctx.drawImage(img, sx, sy, size, size, 0, 0, 256, 256);
    setAvatar(canvas.toDataURL('image/jpeg', 0.82));
  }

  async function save() {
    setBusy(true);
    try {
      const d = await api<{ user: Profile }>('/api/account', {
        method: 'PATCH',
        body: JSON.stringify({ name: name || null, birthday: birthday || null, country: country || null, bio: bio || null, avatarUrl: avatar }),
      });
      toast('Profile saved.', 'success');
      setData((prev) => prev ? { ...prev, profile: { ...prev.profile, ...d.user } } : prev);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not save profile', 'error');
    } finally { setBusy(false); }
  }

  const initials = (data?.profile.name ?? data?.profile.email ?? '?').slice(0, 2).toUpperCase();
  const fmtPaise = (amount: number, currency: string) => currency === 'inr' ? `₹${(amount / 100).toLocaleString('en-IN')}` : `$${(amount / 100).toFixed(2)}`;
  const time = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="hero-glow mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <h1 className="font-display text-3xl font-bold tracking-tight">My profile</h1>
        <p className="mt-1 text-sm text-ink-soft dark:text-white/60">Your details, plan, tokens and recharge history — all in one place.</p>

        <div className="mt-8 grid gap-6 lg:grid-cols-5">
          <section className="card glass p-6 lg:col-span-3">
            <div className="flex items-center gap-4">
              <button type="button" className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-full ring-2 ring-leaf/40 transition hover:ring-leaf" onClick={() => fileRef.current?.click()} aria-label="Change profile picture">
                {avatar ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={avatar} alt="Profile picture" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center bg-leaf/15 font-display text-lg font-bold text-leaf-deep dark:text-leaf">{initials}</span>
                )}
                <span className="absolute inset-x-0 bottom-0 bg-black/50 py-0.5 text-center text-[10px] font-medium text-white opacity-0 transition group-hover:opacity-100">Edit</span>
              </button>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { if (e.target.files?.[0]) void pickAvatar(e.target.files[0]); e.target.value = ''; }} />
              <div className="min-w-0">
                <h2 className="truncate font-display text-lg font-bold">{data?.profile.name || data?.profile.email}</h2>
                <p className="truncate text-sm text-ink-soft dark:text-white/55">{data?.profile.email}</p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-soft dark:text-white/45">
                  <span className="pill pill-active">{data?.plan?.name ?? 'Free'} plan</span>
                  <span>{data?.profile.emailVerified ? '✅ verified' : '⚠️ not verified'}</span>
                  {data?.profile.country && <span>📍 {data.profile.country}</span>}
                  <span>member since {data && time(data.profile.memberSince)}</span>
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium">Name
                <input className="input mt-1.5" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name" />
              </label>
              <label className="block text-sm font-medium">Country
                <input className="input mt-1.5" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="India" autoComplete="country-name" />
              </label>
              <label className="block text-sm font-medium">Birthday
                <input className="input mt-1.5" type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} />
              </label>
              <label className="block text-sm font-medium sm:col-span-2">Bio
                <textarea className="input mt-1.5 min-h-[80px] resize-y" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={600} placeholder="A few lines about you…" />
              </label>
            </div>
            <button className="btn-primary mt-5 px-6 py-2.5 text-sm" disabled={busy || !data} onClick={() => void save()}>{busy ? 'Saving…' : 'Save profile'}</button>
          </section>

          <div className="flex flex-col gap-6 lg:col-span-2">
            <section className="card glass p-6">
              <h3 className="text-xs uppercase tracking-wide text-ink-soft dark:text-white/50">Token balance</h3>
              <p className="mt-2 font-display text-3xl font-bold text-leaf-deep dark:text-leaf-glow">{data ? data.tokens.available.toLocaleString() : '—'}</p>
              <p className="mt-1 text-xs text-ink-soft dark:text-white/50">
                {data ? `${data.tokens.lifetimeUsed.toLocaleString()} tokens used in total` : ''}
              </p>
              {data?.plan && (
                <p className="mt-3 text-xs text-ink-soft dark:text-white/50">
                  {data.plan.isFree ? 'Daily grant' : 'Monthly quota'}: {(data.plan.isFree ? data.plan.dailyTokens : data.plan.monthlyTokens).toLocaleString()}
                </p>
              )}
            </section>

            <motion.div
              initial={{ opacity: 0, y: 24, rotateX: 18 }}
              whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
              viewport={{ once: true }}
              whileHover={{ rotateX: 4, rotateY: -5, scale: 1.03 }}
              style={{ transformStyle: 'preserve-3d', transformPerspective: 900 }}
              className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-leaf-deep via-leaf to-amber p-0.5 shadow-[0_18px_50px_-12px_rgba(255,170,40,0.45)]"
            >
              <Link href="/billing" className="block rounded-2xl bg-forest/85 px-6 py-7 text-center backdrop-blur-xl dark:bg-forest/70">
                <p className="font-display text-xl font-bold tracking-tight text-cream drop-shadow" style={{ textShadow: '0 2px 6px rgba(0,0,0,0.35)' }}>Upgrade now →</p>
                <p className="mt-1 text-xs text-leaf-glow/90">Unlock pro models & bigger limits</p>
              </Link>
            </motion.div>

            <section className="card glass p-6">
              <h3 className="text-xs uppercase tracking-wide text-ink-soft dark:text-white/50">Recharge history</h3>
              {!data && <div className="skeleton mt-3 h-16" />}
              {data?.payments.length === 0 && <p className="mt-3 text-sm text-ink-soft dark:text-white/50">No recharges yet.</p>}
              {data && data.payments.length > 0 && (
                <ul className="mt-3 space-y-2.5">
                  {data.payments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between text-sm">
                      <span>
                        {fmtPaise(p.amount, p.currency)}
                        {p.tokensGranted ? <span className="ml-2 text-xs text-leaf-deep dark:text-leaf">+{p.tokensGranted.toLocaleString()} tok</span> : null}
                      </span>
                      <span className="text-xs text-ink-soft dark:text-white/45">{time(p.createdAt)} · {p.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
