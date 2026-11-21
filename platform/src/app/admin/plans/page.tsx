'use client';

import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/components/toast';
import { api } from '@/lib/client';

type Plan = {
  id: string; slug: string; name: string; priceMonthly: number; priceYearly: number | null;
  priceMonthlyInrPaise: number | null; priceYearlyInrPaise: number | null;
  dailyTokens: number; monthlyTokens: number; tokensPerMinute: number; requestsPerMin: number;
  allowedModels: string[]; isActive: boolean; isFree: boolean;
};

export default function AdminPlansPage() {
  const { toast } = useToast();
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [edits, setEdits] = useState<Record<string, Partial<Plan>>>({});

  const load = useCallback(async () => {
    try { const d = await api<{ plans: Plan[] }>('/api/admin/plans'); setPlans(d.plans); }
    catch (err) { toast(err instanceof Error ? err.message : 'Load failed', 'error'); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  function set(id: string, patch: Partial<Plan>) { setEdits((e) => ({ ...e, [id]: { ...e[id], ...patch } })); }

  async function save(p: Plan) {
    const data = edits[p.id];
    if (!data || Object.keys(data).length === 0) return;
    try {
      await api(`/api/admin/plans/${p.id}`, { method: 'PATCH', body: JSON.stringify(data) });
      toast(`${p.name} plan saved.`, 'success');
      setEdits((e) => { const n = { ...e }; delete n[p.id]; return n; });
      await load();
    } catch (err) { toast(err instanceof Error ? err.message : 'Save failed', 'error'); }
  }

  const num = (v: string) => Number(v);

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Plans</h1>
      <p className="mt-1 mb-8 text-sm text-ink-soft dark:text-white/60">Quotas and rate limits per tier. Changes apply server-side on the next request.</p>
      {!plans && <div className="skeleton h-64" />}
      <div className="grid gap-4 lg:grid-cols-3">
        {plans?.map((p) => {
          const e = edits[p.id] ?? {};
          const cur = { ...p, ...e };
          return (
            <div key={p.id} className="card p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">{p.name} <span className="ml-1 text-xs font-normal text-ink-soft">({p.slug})</span></h2>
                <button className="btn-ghost px-3 py-1 text-xs" onClick={() => set(p.id, { isActive: !cur.isActive })}>{cur.isActive ? 'active' : 'inactive'}</button>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                {([
                  ['priceMonthlyInrPaise', 'Price /mo (₹ paise)'], ['dailyTokens', 'Daily tokens'],
                  ['priceYearlyInrPaise', 'Price /yr (₹ paise)'], ['monthlyTokens', 'Monthly tokens'],
                  ['tokensPerMinute', 'Tokens /min'],
                  ['requestsPerMin', 'Requests /min'],
                ] as const).map(([key, label]) => (
                  <label key={key} className="font-medium">
                    {label}
                    <input className="input mt-1 py-1.5 text-sm" type="number" value={String(cur[key] ?? '')}
                      onChange={(ev) => set(p.id, { [key]: num(ev.target.value) } as Partial<Plan>)} />
                  </label>
                ))}
              </div>
              <label className="mt-3 block text-sm font-medium">
                Allowed models (comma-separated, empty = all)
                <input className="input mt-1 py-1.5 text-sm" value={(cur.allowedModels ?? []).join(', ')}
                  onChange={(ev) => set(p.id, { allowedModels: ev.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
              </label>
              <button className="btn-primary mt-4 w-full py-2 text-sm" disabled={!edits[p.id]} onClick={() => save(p)}>Save changes</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
