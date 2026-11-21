'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Nav } from '@/components/nav';
import { useToast } from '@/components/toast';
import { api } from '@/lib/client';

type Usage = { available: number; plan: { name: string; slug: string; isFree: boolean } | null };
type PlanRow = { slug: string; name: string; priceMonthly: number; dailyTokens: number; monthlyTokens: number; tokensPerMinute: number; requestsPerMin: number; isFree: boolean; isActive: boolean };

function BillingInner() {
  const { toast } = useToast();
  const params = useSearchParams();
  const [usage, setUsage] = useState<Usage | null>(null);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [interval, setInterval] = useState<'monthly' | 'yearly'>('monthly');

  useEffect(() => {
    api<Usage>('/api/usage').then(setUsage).catch(() => undefined);
    api<{ plans: PlanRow[] }>('/api/admin/public-plans').then((d) => setPlans(d.plans.filter((p) => p.isActive))).catch(() => undefined);
  }, []);

  async function upgrade(planSlug: string) {
    setBusy(planSlug);
    try {
      const res = await api<{ mock: boolean; orderId?: string; url?: string; planSlug?: string; interval?: string; amount?: number }>('/api/billing/checkout', {
        method: 'POST',
        body: JSON.stringify({ planSlug, interval }),
      });
      if (!res.mock && res.url) {
        window.location.href = res.url;
        return;
      }
      await api('/api/billing/mock-complete', { method: 'POST', body: JSON.stringify({ orderId: res.orderId, planSlug, interval }) });
      toast(`Upgraded to ${planSlug}! Receipt emailed.`, 'success');
      const u = await api<Usage>('/api/usage');
      setUsage(u);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Checkout failed', 'error');
    } finally {
      setBusy(null);
    }
  }

  const fmt = (cents: number) => `$${(cents / 100).toLocaleString()}`;

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="hero-glow min-h-[80vh] px-4 py-14 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight">Billing</h1>
              <p className="mt-1 text-sm text-ink-soft dark:text-white/60">
                Current plan: <strong>{usage?.plan?.name ?? '…'}</strong> · Balance: <strong>{usage?.available.toLocaleString() ?? '…'} tokens</strong>
              </p>
            </div>
            <div className="glass flex rounded-full p-1 text-sm font-medium">
              {(['monthly', 'yearly'] as const).map((iv) => (
                <button key={iv} onClick={() => setInterval(iv)} className={`rounded-full px-4 py-1.5 capitalize ${interval === iv ? 'bg-agent text-white' : ''}`}>{iv}</button>
              ))}
            </div>
          </div>

          {params.get('status') === 'success' && (
            <div className="card mb-6 border-green-400 bg-green-50 p-5 text-sm text-green-800 dark:bg-green-950 dark:text-green-200">✅ Payment received — your plan and tokens are active.</div>
          )}

          <div className="grid gap-6 md:grid-cols-3">
            {plans.map((p) => {
              const price = interval === 'yearly' ? (p.slug === 'free' ? 0 : (p.slug === 'pro' ? 20000 : 100000)) : p.priceMonthly;
              const isCurrent = usage?.plan?.slug === p.slug;
              return (
                <div key={p.slug} className={`card flex flex-col p-7 ${p.slug === 'pro' ? 'ring-2 ring-agent' : ''}`}>
                  <h2 className="text-lg font-bold">{p.name}</h2>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="text-3xl font-extrabold">{fmt(price)}</span>
                    <span className="text-xs text-ink-soft dark:text-white/55">/{interval === 'yearly' ? 'year' : 'mo'}</span>
                  </div>
                  <ul className="mt-5 flex-1 space-y-2 text-sm text-ink-soft dark:text-white/70">
                    <li>✓ {p.dailyTokens.toLocaleString()} tokens / day</li>
                    <li>✓ {p.monthlyTokens.toLocaleString()} tokens / month</li>
                    <li>✓ {p.requestsPerMin} requests / min</li>
                    <li>✓ {p.isFree ? 'Free-tier models' : 'All enabled models'}</li>
                  </ul>
                  {p.slug === 'free' ? (
                    <span className="mt-6 rounded-full bg-black/5 px-4 py-2 text-center text-sm dark:bg-white/10">Included everywhere</span>
                  ) : isCurrent ? (
                    <span className="mt-6 rounded-full bg-green-100 px-4 py-2 text-center text-sm font-semibold text-green-700 dark:bg-green-900 dark:text-green-200">Current plan</span>
                  ) : (
                    <button className="btn-primary mt-6 py-2.5 text-sm" disabled={busy === p.slug} onClick={() => upgrade(p.slug)}>
                      {busy === p.slug ? 'Redirecting…' : `Upgrade to ${p.name}`}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <p className="mt-8 text-center text-xs text-ink-soft dark:text-white/45">
            Payments run through Stripe Checkout when configured. Without keys, mock checkout lets you test the full upgrade flow safely.
          </p>
        </div>
      </main>
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen"><Nav /><div className="skeleton mx-auto mt-16 h-96 max-w-5xl" /></div>}>
      <BillingInner />
    </Suspense>
  );
}
