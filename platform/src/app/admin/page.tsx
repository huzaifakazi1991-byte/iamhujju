'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/client';

type Analytics = {
  days: number;
  totals: { tokens: number; cost: string; requests: number; userCount: number; paidSubs: number; revenueInrPaise: number; payments: number };
  perDay: { day: string; tokens: number; requests: number }[];
  perModel: { modelId: string; slug: string; displayName: string; tokens: number; requests: number }[];
  perUser: { email: string; tokens: number; requests: number }[];
};

export default function AdminOverview() {
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<Analytics>('/api/admin/analytics?days=14').then(setData).catch((e) => setError(e.message));
  }, []);

  const maxTokens = data ? Math.max(1, ...data.perDay.map((d) => d.tokens)) : 1;

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Platform overview</h1>
      <p className="mt-1 text-sm text-ink-soft dark:text-white/60">Last 14 days.</p>
      {error && <div className="card mt-6 border-red-300 p-5 text-sm text-red-600">⚠️ {error}</div>}
      {!data && !error && <div className="skeleton mt-6 h-64" />}
      {data && (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
            {[
              ['Users', data.totals.userCount.toLocaleString()],
              ['Paid subscribers', data.totals.paidSubs.toLocaleString()],
              ['Tokens used', data.totals.tokens.toLocaleString()],
              ['Requests', data.totals.requests.toLocaleString()],
              ['Revenue (INR)', `₹${(data.totals.revenueInrPaise / 100).toLocaleString('en-IN')} · ${data.totals.payments} payments`],
              ['Metered cost', `$${Number(data.totals.cost).toFixed(4)}`],
            ].map(([label, value]) => (
              <div key={label} className="card p-5">
                <p className="text-xs uppercase tracking-wide text-ink-soft dark:text-white/50">{label}</p>
                <p className="mt-1.5 text-2xl font-bold">{value}</p>
              </div>
            ))}
          </div>

          <div className="card mt-6 p-6">
            <h2 className="mb-4 font-bold">Tokens per day</h2>
            {data.perDay.length === 0 ? (
              <p className="text-sm text-ink-soft dark:text-white/60">No usage recorded yet.</p>
            ) : (
              <div className="flex h-40 items-end gap-1.5">
                {data.perDay.map((d) => (
                  <div key={d.day} className="group relative flex-1">
                    <div className="w-full rounded-t bg-agent/80 transition-all hover:bg-agent" style={{ height: `${Math.max(4, (d.tokens / maxTokens) * 150)}px` }} />
                    <span className="pointer-events-none absolute -top-8 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-black px-2 py-1 text-[10px] text-white group-hover:block">
                      {d.day}: {d.tokens.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="card p-6">
              <h2 className="mb-3 font-bold">Top models</h2>
              {data.perModel.length === 0 ? <p className="text-sm text-ink-soft dark:text-white/60">No data.</p> : (
                <ul className="space-y-2 text-sm">
                  {data.perModel.map((m) => (
                    <li key={m.modelId} className="flex justify-between"><span className="truncate">{m.displayName} <span className="font-mono text-[10px] text-ink-soft">{m.slug}</span></span><span>{m.tokens.toLocaleString()} tok · {m.requests} req</span></li>
                  ))}
                </ul>
              )}
            </div>
            <div className="card p-6">
              <h2 className="mb-3 font-bold">Top users</h2>
              {data.perUser.length === 0 ? <p className="text-sm text-ink-soft dark:text-white/60">No data.</p> : (
                <ul className="space-y-2 text-sm">
                  {data.perUser.map((u) => (
                    <li key={u.email} className="flex justify-between"><span className="truncate">{u.email}</span><span>{u.tokens.toLocaleString()} tok</span></li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
