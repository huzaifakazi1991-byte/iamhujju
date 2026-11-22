'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Nav } from '@/components/nav';
import { useToast } from '@/components/toast';
import { api } from '@/lib/client';

type ProviderHealth = { enabled: boolean; lastTestAt: string | null; lastTestOk: boolean | null; lastTestDetail: string | null };
type ModelStats = { requests24h: number; tokens24h: number; errors24h: number; avgLatencyMs: number | null };
type ModelRow = {
  id: string; providerId: string; slug: string; displayName: string; capability: string; contextWindow: number; maxOutputTokens: number;
  costPer1kInput: string | number; costPer1kOutput: string | number; tierRequired: string; adminEnabled: boolean; displayOrder: number;
  provider?: { name: string };
  providerName?: string;
  providerHealth?: ProviderHealth;
  stats?: ModelStats;
};
type Provider = { id: string; name: string; enabled: boolean; keyConfigured: boolean };

const EMPTY = { providerId: '', slug: '', displayName: '', capability: 'chat', contextWindow: 8192, maxOutputTokens: 4096, costPer1kInput: 0, costPer1kOutput: 0, tierRequired: 'free', displayOrder: 0 };

const CAPABILITY_LABEL: Record<string, string> = { chat: '💬 Chat', image: '🖼 Image', video: '🎬 Video', tts: '🔊 TTS' };

export default function AdminModelsPage() {
  const { toast } = useToast();
  const [models, setModels] = useState<ModelRow[] | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [form, setForm] = useState({ ...EMPTY, adminEnabled: true });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [providerFilter, setProviderFilter] = useState('all:all');
  const [live, setLive] = useState(false);
  const firstLoad = useRef(true);

  const load = useCallback(
    async (silent = false) => {
      try {
        const [m, p] = await Promise.all([
          api<{ models: ModelRow[] }>('/api/admin/models'),
          api<{ providers: Provider[] }>('/api/admin/providers'),
        ]);
        setModels(m.models);
        setProviders(p.providers);
        setForm((f) => ({ ...f, providerId: f.providerId || p.providers[0]?.id || '' }));
        if (firstLoad.current) {
          firstLoad.current = false;
          setLive(true);
        }
      } catch (err) {
        if (!silent) toast(err instanceof Error ? err.message : 'Load failed', 'error');
      }
    },
    [toast],
  );

  useEffect(() => {
    load();
    const t = setInterval(() => load(true), 20000);
    return () => clearInterval(t);
  }, [load]);

  const groupedModels = useMemo(() => {
    const groups = new Map<string, { key: string; name: string; models: ModelRow[] }>();
    for (const p of providers) groups.set(p.id, { key: p.id, name: p.name, models: [] });
    for (const m of models ?? []) {
      const g = groups.get(m.providerId);
      if (g) g.models.push(m);
      else groups.set(m.providerId, { key: m.providerId, name: m.providerName ?? m.provider?.name ?? 'unknown', models: [m] });
    }
    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [models, providers]);

  const visibleModels = useMemo(() => {
    if (!models) return null;
    if (providerFilter === 'all:all') return models;
    const [key, slug] = providerFilter.split(':');
    if (slug && slug !== 'all') return models.filter((m) => m.id === key);
    return models.filter((m) => m.providerId === key);
  }, [models, providerFilter]);

  function resetForm() {
    setEditingId(null);
    setForm({ ...EMPTY, adminEnabled: true, providerId: providers[0]?.id ?? '' });
  }

  function startEdit(m: ModelRow) {
    setEditingId(m.id);
    setForm({
      providerId: m.providerId,
      slug: m.slug,
      displayName: m.displayName,
      capability: m.capability ?? 'chat',
      contextWindow: m.contextWindow,
      maxOutputTokens: m.maxOutputTokens,
      costPer1kInput: Number(m.costPer1kInput),
      costPer1kOutput: Number(m.costPer1kOutput),
      tierRequired: m.tierRequired,
      displayOrder: m.displayOrder,
      adminEnabled: m.adminEnabled,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingId) {
        const { slug: _slug, ...patch } = form;
        await api(`/api/admin/models/${editingId}`, { method: 'PATCH', body: JSON.stringify(patch) });
        toast(`Model "${form.displayName}" updated.`, 'success');
      } else {
        await api('/api/admin/models', { method: 'POST', body: JSON.stringify(form) });
        toast(`Model "${form.slug}" created.`, 'success');
      }
      resetForm();
      await load(true);
    } catch (err) {
      toast(err instanceof Error ? err.message : editingId ? 'Update failed' : 'Create failed', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function toggle(m: ModelRow) {
    try {
      await api(`/api/admin/models/${m.id}`, { method: 'PATCH', body: JSON.stringify({ adminEnabled: !m.adminEnabled }) });
      await load(true);
    } catch (err) { toast(err instanceof Error ? err.message : 'Update failed', 'error'); }
  }

  async function remove(m: ModelRow) {
    if (!confirm(`Delete model "${m.slug}"?`)) return;
    try {
      await api(`/api/admin/models/${m.id}`, { method: 'DELETE' });
      toast('Model deleted.', 'success');
      await load(true);
    } catch (err) { toast(err instanceof Error ? err.message : 'Delete failed', 'error'); }
  }

  function healthPill(m: ModelRow) {
    const h = m.providerHealth;
    if (!h) return <span className="text-xs text-ink-soft dark:text-white/40">—</span>;
    if (h.lastTestOk === true) {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700 dark:bg-green-900 dark:text-green-200" title={h.lastTestDetail ?? ''}>
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" /> healthy
        </span>
      );
    }
    if (h.lastTestOk === false) {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700 dark:bg-red-900 dark:text-red-200" title={h.lastTestDetail ?? ''}>
          <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> failing
        </span>
      );
    }
    return <span className="inline-flex items-center gap-1.5 rounded-full bg-black/10 px-2.5 py-1 text-xs font-semibold text-ink-soft dark:bg-white/10 dark:text-white/50"><span className="h-1.5 w-1.5 rounded-full bg-gray-400" /> untested</span>;
  }

  function loadCell(m: ModelRow) {
    const s = m.stats;
    if (!s) return <span className="text-xs text-ink-soft dark:text-white/40">—</span>;
    const errPct = s.requests24h > 0 ? Math.round((s.errors24h / s.requests24h) * 100) : 0;
    return (
      <span className="whitespace-nowrap text-xs" title={`${s.tokens24h.toLocaleString()} tokens in the last 24 h`}>
        <span className="font-semibold">{s.requests24h}</span> req · {errPct > 0 ? <span className="text-red-500">{errPct}% err · </span> : null}
        {s.avgLatencyMs != null ? `${(s.avgLatencyMs / 1000).toFixed(1)}s avg` : 'no traffic yet'}
      </span>
    );
  }

  return (
    <div>
      <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight">
        Models
        {live && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-leaf/12 px-2.5 py-1 text-xs font-semibold text-leaf-deep dark:text-leaf-glow" title="Auto-refreshes every 20 s">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-leaf" /> Live
          </span>
        )}
      </h1>
      <p className="mt-1 mb-8 text-sm text-ink-soft dark:text-white/60">
        Register provider model slugs, set token budgets (context window · max output) and pricing multipliers, and monitor live load &amp; health. Disabled models are invisible to users.
      </p>

      <div className="card mb-8 flex flex-wrap items-end gap-4 p-5">
        <label className="block min-w-56 flex-1 text-sm font-medium">
          Browse models by provider
          <select className="input mt-1.5" value={providerFilter} onChange={(e) => setProviderFilter(e.target.value)} aria-label="Filter models by provider">
            <option value="all:all">All providers · all models ({models?.length ?? 0})</option>
            {groupedModels.map((g) => (
              <optgroup key={g.key} label={g.name}>
                <option value={`${g.key}:all`}>{g.name} — all models ({g.models.length})</option>
                {g.models.map((m) => (
                  <option key={m.id} value={`${m.id}:${m.slug}`}>&nbsp;&nbsp;↳ {m.displayName} ({CAPABILITY_LABEL[m.capability] ?? m.capability})</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        {providerFilter !== 'all:all' && (
          <button type="button" className="btn-ghost px-4 py-2 text-sm" onClick={() => setProviderFilter('all:all')}>
            Clear filter
          </button>
        )}
      </div>

      <form onSubmit={submit} className="card mb-8 grid gap-4 p-6 sm:grid-cols-3">
        <div className="sm:col-span-3 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-ink-soft dark:text-white/50">{editingId ? 'Edit model' : 'Add model'}</h2>
          {editingId && (
            <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={resetForm}>Cancel edit</button>
          )}
        </div>
        <label className="text-sm font-medium">
          Provider
          <select className="input mt-1.5" value={form.providerId} onChange={(e) => setForm({ ...form, providerId: e.target.value })} required disabled={editingId !== null}>
            <option value="">Select…</option>
            {providers.map((p) => <option key={p.id} value={p.id}>{p.name}{p.keyConfigured ? '' : ' (no key)'}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">
          Slug (provider's model name)
          <input className="input mt-1.5" required value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="mistral-small-latest" disabled={editingId !== null} />
        </label>
        <label className="text-sm font-medium">
          Display name
          <input className="input mt-1.5" required value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder="Mistral Small" />
        </label>
        <label className="text-sm font-medium">
          Capability
          <select className="input mt-1.5" value={form.capability} onChange={(e) => setForm({ ...form, capability: e.target.value })}>
            <option value="chat">chat (streaming text)</option>
            <option value="image">image generation</option>
            <option value="video">video generation</option>
            <option value="tts">speech / tts</option>
          </select>
        </label>
        <label className="text-sm font-medium">
          Minimum tier
          <select className="input mt-1.5" value={form.tierRequired} onChange={(e) => setForm({ ...form, tierRequired: e.target.value })}>
            <option value="free">free</option>
            <option value="pro">pro</option>
            <option value="business">business</option>
          </select>
        </label>
        <label className="text-sm font-medium" title="Maximum completion tokens this model may generate per request">
          Max output tokens / request
          <input className="input mt-1.5" type="number" min="16" max="100000" value={form.maxOutputTokens} onChange={(e) => setForm({ ...form, maxOutputTokens: Number(e.target.value) })} />
        </label>
        <label className="text-sm font-medium" title="Total prompt + history window">
          Context window (tokens)
          <input className="input mt-1.5" type="number" min="16" max="10000000" value={form.contextWindow} onChange={(e) => setForm({ ...form, contextWindow: Number(e.target.value) })} />
        </label>
        <label className="text-sm font-medium">
          $/1K input tokens
          <input className="input mt-1.5" type="number" step="0.0001" min="0" value={form.costPer1kInput} onChange={(e) => setForm({ ...form, costPer1kInput: Number(e.target.value) })} />
        </label>
        <label className="text-sm font-medium">
          $/1K output tokens
          <input className="input mt-1.5" type="number" step="0.0001" min="0" value={form.costPer1kOutput} onChange={(e) => setForm({ ...form, costPer1kOutput: Number(e.target.value) })} />
        </label>
        <label className="text-sm font-medium" title="Ordering in the user-facing model list">
          Display order
          <input className="input mt-1.5" type="number" min="0" value={form.displayOrder} onChange={(e) => setForm({ ...form, displayOrder: Number(e.target.value) })} />
        </label>
        <label className="flex items-center gap-2 self-end text-sm font-medium">
          <input type="checkbox" checked={form.adminEnabled} onChange={(e) => setForm({ ...form, adminEnabled: e.target.checked })} className="h-4 w-4" />
          Visible to users
        </label>
        <div className="sm:col-span-3">
          <button className="btn-primary px-6 py-2.5 text-sm" disabled={loading || !form.providerId}>{loading ? (editingId ? 'Saving…' : 'Creating…') : editingId ? 'Save changes' : 'Add model'}</button>
        </div>
      </form>

      {!models && <div className="skeleton h-40" />}
      {models?.length === 0 && <div className="card p-10 text-center text-sm text-ink-soft dark:text-white/60">No models registered yet.</div>}
      {visibleModels && visibleModels.length > 0 && (
        <div className="card overflow-x-auto glass">
          <table className="table-glass">
            <thead>
              <tr className="border-b border-black/5 text-xs uppercase tracking-wide text-ink-soft dark:border-white/10 dark:text-white/50">
                <th className="px-5 py-3">Slug</th><th className="px-5 py-3">Name</th><th className="px-5 py-3">Provider</th><th className="px-5 py-3">Type</th>
                <th className="px-5 py-3">Tier</th><th className="px-5 py-3" title="Context window · max output tokens per request">Tokens (ctx / max out)</th>
                <th className="px-5 py-3">$ in/out per 1K</th><th className="px-5 py-3" title="Provider health · 24h requests · error rate · avg latency">Status &amp; load</th><th className="px-5 py-3">Visible</th><th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {visibleModels.map((m) => (
                <tr key={m.id} className="border-b border-black/5 last:border-0 dark:border-white/5">
                  <td className="px-5 py-3 font-mono text-xs">{m.slug}</td>
                  <td className="px-5 py-3">{m.displayName}</td>
                  <td className="px-5 py-3">{m.providerName ?? m.provider?.name}</td>
                  <td className="px-5 py-3"><span className="rounded-full bg-leaf/12 px-2.5 py-1 text-xs font-semibold text-leaf-deep dark:text-leaf-glow" title={m.capability}>{CAPABILITY_LABEL[m.capability] ?? m.capability}</span></td>
                  <td className="px-5 py-3">{m.tierRequired}</td>
                  <td className="px-5 py-3 whitespace-nowrap text-xs">{(m.contextWindow / 1024).toFixed(0)}K / {m.maxOutputTokens.toLocaleString()}</td>
                  <td className="px-5 py-3">${Number(m.costPer1kInput).toFixed(4)} / ${Number(m.costPer1kOutput).toFixed(4)}</td>
                  <td className="px-5 py-3"><div className="flex flex-col gap-1">{healthPill(m)}{loadCell(m)}</div></td>
                  <td className="px-5 py-3">
                    <button onClick={() => toggle(m)} className={`rounded-full px-3 py-1 text-xs font-semibold ${m.adminEnabled ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200' : 'bg-black/10 dark:bg-white/10'}`}>
                      {m.adminEnabled ? 'enabled' : 'hidden'}
                    </button>
                  </td>
                  <td className="px-5 py-3 text-right whitespace-nowrap">
                    <button className="mr-3 text-xs text-leaf-deep hover:underline dark:text-leaf-glow" onClick={() => startEdit(m)}>Edit</button>
                    <button className="text-xs text-red-500 hover:underline" onClick={() => remove(m)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {models && visibleModels?.length === 0 && (
        <div className="card p-10 text-center text-sm text-ink-soft dark:text-white/60">No models match this filter.</div>
      )}
    </div>
  );
}
