'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Nav } from '@/components/nav';
import { useToast } from '@/components/toast';
import { api } from '@/lib/client';

type Usage = { available: number; plan: { name: string; slug: string; isFree: boolean } | null };
type PlanRow = { slug: string; name: string; priceMonthly: number; priceYearly: number | null; priceMonthlyInrPaise: number | null; priceYearlyInrPaise: number | null; dailyTokens: number; monthlyTokens: number; tokensPerMinute: number; requestsPerMin: number; isFree: boolean; isActive: boolean };
type PackRow = { id: string; name: string; tagline: string; inrPaise: number; tokens: number };
type CheckoutRes = { mock: boolean; razorpay?: boolean; keyId?: string; orderId?: string; amountPaise?: number; currency?: string; url?: string; planSlug?: string; interval?: string; amount?: number };

declare global {
  interface Window { Razorpay?: new (opts: Record<string, unknown>) => { open: () => void } }
}

function loadRazorpayScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load the Razorpay checkout. Check your connection and retry.'));
    document.body.appendChild(s);
  });
}

function usdToInrPaise(cents: number): number {
  return Math.round(cents * 4.1);
}

function BillingInner() {
  const { toast } = useToast();
  const params = useSearchParams();
  const [usage, setUsage] = useState<Usage | null>(null);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [interval, setInterval] = useState<'monthly' | 'yearly'>('monthly');
  const [packs, setPacks] = useState<PackRow[] | null>(null);

  useEffect(() => {
    api<Usage>('/api/usage').then(setUsage).catch(() => undefined);
    api<{ plans: PlanRow[] }>('/api/admin/public-plans').then((d) => setPlans(d.plans.filter((p) => p.isActive))).catch(() => undefined);
    api<{ packs: PackRow[] }>('/api/billing/topup/packs').then((d) => setPacks(d.packs)).catch(() => undefined);
  }, []);

  type RazorpayCheckout = { keyId: string; orderId: string; amountPaise?: number; currency?: string };

  async function payViaRazorpay(res: RazorpayCheckout, description: string) {
    await loadRazorpayScript();
    await new Promise<void>((resolve, reject) => {
      const rzp = new window.Razorpay!({
        key: res.keyId,
        order_id: res.orderId,
        amount: res.amountPaise,
        currency: res.currency ?? 'INR',
        name: 'IamHujju',
        description,
        theme: { color: '#2f8f4e' },
        handler: (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          api('/api/billing/razorpay/verify', {
            method: 'POST',
            body: JSON.stringify(response),
          }).then(() => resolve()).catch(reject);
        },
        modal: { ondismiss: () => reject(new Error('Payment cancelled.')) },
      });
      rzp.open();
    });
  }

  async function upgrade(planSlug: string) {
    setBusy(planSlug);
    try {
      const res = await api<CheckoutRes>('/api/billing/checkout', {
        method: 'POST',
        body: JSON.stringify({ planSlug, interval }),
      });
      const { orderId: upOrderId, keyId: upKeyId, amountPaise: upAmount, currency: upCurrency } = res;
      if (res.razorpay && upOrderId && upKeyId) {
        await payViaRazorpay({ keyId: upKeyId, orderId: upOrderId, amountPaise: upAmount, currency: upCurrency }, `${planSlug} plan (${interval})`);
        toast(`Upgraded to ${planSlug}! Receipt emailed.`, 'success');
        const u = await api<Usage>('/api/usage');
        setUsage(u);
        return;
      }
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

  async function buyTopup(packId: string) {
    setBusy(`topup-${packId}`);
    try {
      const res = await api<CheckoutRes>('/api/billing/topup/checkout', {
        method: 'POST',
        body: JSON.stringify({ packId }),
      });
      const { orderId: tkOrderId, keyId: tkKeyId, amountPaise: tkAmount, currency: tkCurrency } = res;
      if (res.razorpay && tkOrderId && tkKeyId) {
        await payViaRazorpay({ keyId: tkKeyId, orderId: tkOrderId, amountPaise: tkAmount, currency: tkCurrency }, `Token top-up (${packId})`);
        toast('Top-up successful — tokens added to your balance!', 'success');
      } else {
        await api('/api/billing/topup/mock-complete', { method: 'POST', body: JSON.stringify({ orderId: res.orderId, packId }) });
        toast('Top-up successful — tokens added to your balance!', 'success');
      }
      const u = await api<Usage>('/api/usage');
      setUsage(u);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Top-up failed', 'error');
    } finally {
      setBusy(null);
    }
  }

  const fmt = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`;

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="hero-glow min-h-[80vh] px-4 py-14 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Billing</h1>
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
              const price = interval === 'yearly'
                ? (p.priceYearlyInrPaise ?? (p.priceYearly ? usdToInrPaise(p.priceYearly) : 0))
                : (p.priceMonthlyInrPaise ?? usdToInrPaise(p.priceMonthly));
              const isCurrent = usage?.plan?.slug === p.slug;
              return (
                <div key={p.slug} className={`card flex flex-col p-7 ${p.slug === 'pro' ? 'ring-2 ring-agent' : ''}`}>
                  <h2 className="text-lg font-bold">{p.name}</h2>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="text-3xl font-bold">{fmt(price)}</span>
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
                      {busy === p.slug ? 'Opening checkout…' : `Upgrade to ${p.name}`}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <h2 className="mt-12 text-xl font-bold">Pay as you go</h2>
          <p className="text-body-soft mt-1 text-sm">Need more tokens without changing your plan? Top up instantly — packs stack on your current balance.</p>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {packs?.map((pack) => (
              <div key={pack.id} className="card flex flex-col p-6">
                <div className="flex items-baseline justify-between">
                  <h3 className="text-base font-bold">{pack.name}</h3>
                  <span className="text-num text-xl font-semibold">{fmt(pack.inrPaise)}</span>
                </div>
                <p className="text-body-soft mt-1 text-xs">{pack.tagline}</p>
                <p className="mt-3 text-sm font-medium">+ {pack.tokens.toLocaleString('en-IN')} tokens</p>
                <p className="text-body-soft mt-0.5 text-xs">One-time purchase · never expires</p>
                <button className="btn-ghost mt-4 py-2 text-sm" disabled={busy === `topup-${pack.id}`} onClick={() => buyTopup(pack.id)}>
                  {busy === `topup-${pack.id}` ? 'Opening checkout…' : 'Buy tokens'}
                </button>
              </div>
            ))}
            {!packs && <div className="skeleton h-40 md:col-span-3" />}
          </div>

          <p className="mt-8 text-center text-xs text-ink-soft dark:text-white/45">
            Payments are processed securely by Razorpay (UPI, cards, netbanking) in INR. Plans only activate after a real, verified payment — mock checkout is restricted to the administrator for testing.
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
