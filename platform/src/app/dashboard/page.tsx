'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Nav } from '@/components/nav';
import { api } from '@/lib/client';

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

  const stat = (label: string, value: string, sub?: string) => (
    <div className="card p-6">
      <p className="text-sm text-ink-soft dark:text-white/60">{label}</p>
      <p className="mt-2 text-3xl font-extrabold tracking-tight">{value}</p>
      {sub && <p className="mt-1 text-xs text-ink-soft dark:text-white/50">{sub}</p>}
    </div>
  );

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Dashboard</h1>
            <p className="mt-1 text-sm text-ink-soft dark:text-white/60">Your usage, balance and plan.</p>
          </div>
          <Link href="/playground" className="btn-primary px-5 py-2.5 text-sm">Open playground</Link>
        </div>

        {error && <div className="card mb-6 border-red-300 p-6 text-sm text-red-600">⚠️ {error}</div>}
        {!usage && !error && (
          <div className="grid gap-4 sm:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-32" />)}</div>
        )}

        {usage && (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              {stat('Available tokens', usage.available.toLocaleString(), usage.plan ? `on the ${usage.plan.name} plan` : undefined)}
              {stat('Used today', usage.todayTokens.toLocaleString(), usage.plan && usage.plan.dailyTokens > 0 ? `of ${usage.plan.dailyTokens.toLocaleString()} daily limit` : 'no daily limit')}
              {stat('Used this month', usage.monthTokens.toLocaleString(), usage.plan && usage.plan.monthlyTokens > 0 ? `of ${usage.plan.monthlyTokens.toLocaleString()} monthly limit` : 'no monthly limit')}
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

        <h2 className="mb-4 mt-10 text-xl font-bold">Recent requests</h2>
        {!recent && <div className="skeleton h-48" />}
        {recent && recent.length === 0 && (
          <div className="card p-10 text-center text-sm text-ink-soft dark:text-white/60">
            No requests yet. <Link href="/playground" className="text-agent-deep hover:underline dark:text-agent">Send your first message →</Link>
          </div>
        )}
        {recent && recent.length > 0 && (
          <div className="card overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-black/5 text-xs uppercase tracking-wide text-ink-soft dark:border-white/10 dark:text-white/50">
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
                  <tr key={r.id} className="border-b border-black/5 last:border-0 dark:border-white/5">
                    <td className="px-5 py-3 whitespace-nowrap">{new Date(r.createdAt).toLocaleString()}</td>
                    <td className="px-5 py-3 font-mono text-xs">{r.modelId}</td>
                    <td className="px-5 py-3">{r.promptTokens.toLocaleString()}</td>
                    <td className="px-5 py-3">{r.completionTokens.toLocaleString()}</td>
                    <td className="px-5 py-3 font-semibold">{r.totalTokens.toLocaleString()}</td>
                    <td className="px-5 py-3">{r.status}</td>
                    <td className="px-5 py-3">{r.latencyMs != null ? `${r.latencyMs} ms` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
