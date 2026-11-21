'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Nav } from '@/components/nav';
import { api } from '@/lib/client';
import { GlassCard } from '@/components/ui/glass';
import { Sparkline } from '@/components/ui/glass';

type Usage = {
  available: number; reserved: number; lifetimeUsed: number;
  todayTokens: number; monthTokens: number; lifetimeTokens: number;
  plan: { slug: string; name: string; dailyTokens: number; monthlyTokens: number; requestsPerMin: number; isFree: boolean } | null;
};

type UsageRecord = { id: string; modelId: string; promptTokens: number; completionTokens: number; totalTokens: number; status: string; latencyMs: number | null; createdAt: string };

export default function DashboardPage() {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [recent, setRecent] = useState<UsageRecord[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<Usage>('/api/usage').then(setUsage).catch((e) => setError(e.message));
    api<{ usage: UsageRecord[] }>('/api/usage/recent').then((d) => setRecent(d.usage)).catch(() => setRecent([]));
  }, []);

  const stat = (label: string, value: string, sub?: string, spark?: number[]) => (
    <div className="card card-hover p-6">
      <div className="flex items-start justify-between gap-3">
        <p className="text-caption">{label}</p>
        {spark && spark.length > 1 && <Sparkline data={spark} width={96} height={30} className="mt-1 opacity-90" />}
      </div>
      <p className="text-num mt-2 text-3xl">{value}</p>
      {sub && <p className="mt-1 text-xs text-body-soft">{sub}</p>}
    </div>
  );

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-h1">Dashboard</h1>
            <p className="text-body-soft mt-1 text-sm">Your usage, balance and plan.</p>
          </div>
          <div className="flex items-center gap-3">
            {usage?.plan && !usage.plan.isFree && (
              <a href="/api/usage/export" className="btn-ghost px-5 py-2.5 text-sm">⬇ Export CSV</a>
            )}
            <Link href="/playground" className="btn-primary px-5 py-2.5 text-sm">Open playground</Link>
          </div>
        </div>

        {error && <div className="card mb-6 border-red-400/40 bg-red-500/8 p-6 text-sm text-red-700 dark:text-red-300">⚠️ {error}</div>}
        {!usage && !error && (
          <div className="grid gap-4 sm:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-32" />)}</div>
        )}

        {usage && (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              {stat('Available tokens', usage.available.toLocaleString(), usage.plan ? `on the ${usage.plan.name} plan` : undefined)}
              {stat('Used today', usage.todayTokens.toLocaleString(), usage.plan && usage.plan.dailyTokens > 0 ? `of ${usage.plan.dailyTokens.toLocaleString()} daily limit` : 'no daily limit')}
              {stat('Used this month', usage.monthTokens.toLocaleString(), usage.plan && usage.plan.monthlyTokens > 0 ? `of ${usage.plan.monthlyTokens.toLocaleString()} monthly limit` : 'no monthly limit')}
              <div className="card p-6 sm:col-span-3">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-caption">Daily quota progress</p>
                    <p className="text-num mt-2 text-2xl">{usage.todayTokens.toLocaleString()} <span className="text-sm font-medium text-body-soft">of {usage.plan?.dailyTokens ? usage.plan.dailyTokens.toLocaleString() : '∞'} today</span></p>
                  </div>
                  <Sparkline data={[usage.lifetimeTokens / 220, usage.monthTokens / 40, usage.todayTokens, usage.available].map((n) => Math.max(0, n))} width={220} height={44} />
                </div>
                <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-forest/8 dark:bg-white/8">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-leaf-deep to-leaf-glow transition-all duration-500"
                    style={{ width: usage.plan && usage.plan.dailyTokens > 0 ? `${Math.min(100, (usage.todayTokens / usage.plan.dailyTokens) * 100)}%` : '0%' }}
                  />
                </div>
                <p className="mt-2 text-xs text-body-soft">Resets at 00:00 UTC · reserved tokens are held while streams are in flight</p>
              </div>
            </div>
            {usage.plan?.isFree && (
              <div className="card mt-6 flex flex-wrap items-center justify-between gap-4 border-agent/30 bg-agent/5 p-6">
                <div>
                  <p className="font-bold">Need more headroom?</p>
                  <p className="mt-1 text-sm text-ink-soft dark:text-white/65">Upgrade for all enabled models, higher rate limits and millions of tokens.</p>
                </div>
                <Link href="/billing" className="btn-primary px-5 py-2.5 text-sm">Upgrade</Link>
              </div>
            )}
          </>
        )}

        <h2 className="font-display mb-4 mt-10 text-xl font-bold tracking-tight">Recent requests</h2>
        {!recent && <div className="skeleton h-48" />}
        {recent && recent.length === 0 && (
          <GlassCard className="p-10 text-center">
            <div className="mb-3 text-3xl" aria-hidden>🌿</div>
            <p className="text-body-soft text-sm">
              No requests yet.{' '}
              <Link href="/playground" className="font-semibold text-leaf-deep hover:underline dark:text-leaf">Send your first message →</Link>
            </p>
          </GlassCard>
        )}
        {recent && recent.length > 0 && (
          <GlassCard className="overflow-x-auto">
            <table className="table-glass">
              <thead>
                <tr>
                  <th className="px-5 py-3">When</th>
                  <th className="px-5 py-3">Model</th>
                  <th className="px-5 py-3">Prompt</th>
                  <th className="px-5 py-3">Completion</th>
                  <th className="px-5 py-3">Total</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Latency</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id}>
                    <td className="px-5 py-3 whitespace-nowrap">{new Date(r.createdAt).toLocaleString()}</td>
                    <td className="px-5 py-3 font-mono text-xs">{r.modelId}</td>
                    <td className="px-5 py-3">{r.promptTokens.toLocaleString()}</td>
                    <td className="px-5 py-3">{r.completionTokens.toLocaleString()}</td>
                    <td className="px-5 py-3 font-semibold">{r.totalTokens.toLocaleString()}</td>
                    <td className="px-5 py-3">
                      <span className={`pill ${r.status === 'completed' ? 'pill-active' : r.status === 'error' || r.status === 'blocked' ? 'pill-danger' : 'pill-muted'}`}>{r.status}</span>
                    </td>
                    <td className="px-5 py-3">{r.latencyMs != null ? `${r.latencyMs} ms` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </GlassCard>
        )}
      </main>
    </div>
  );
}
