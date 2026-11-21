'use client';

import { useEffect, useState } from 'react';
import { Nav } from '@/components/nav';
import { useToast } from '@/components/toast';
import { api } from '@/lib/client';

type ModelRow = {
  id: string; providerId: string; slug: string; displayName: string; contextWindow: number; maxOutputTokens: number;
  costPer1kInput: string | number; costPer1kOutput: string | number; tierRequired: string; adminEnabled: boolean; displayOrder: number;
  provider?: { name: string };
  providerName?: string;
};
type Provider = { id: string; name: string; enabled: boolean; keyConfigured: boolean };

const EMPTY = { providerId: '', slug: '', displayName: '', contextWindow: 8192, maxOutputTokens: 4096, costPer1kInput: 0, costPer1kOutput: 0, tierRequired: 'free', displayOrder: 0 };

export default function AdminModelsPage() {
  const { toast } = useToast();
  const [models, setModels] = useState<ModelRow[] | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [form, setForm] = useState({ ...EMPTY, adminEnabled: true });
  const [loading, setLoading] = useState(false);

  async function load() {
    try {
      const [m, p] = await Promise.all([
        api<{ models: ModelRow[] }>('/api/admin/models'),
        api<{ providers: Provider[] }>('/api/admin/providers'),
      ]);
      setModels(m.models);
      setProviders(p.providers);
      setForm((f) => ({ ...f, providerId: f.providerId || p.providers[0]?.id || '' }));
    } catch (err) { toast(err instanceof Error ? err.message : 'Load failed', 'error'); }
  }

  useEffect(() => { load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await api('/api/admin/models', { method: 'POST', body: JSON.stringify(form) });
      toast(`Model "${form.slug}" created.`, 'success');
      setForm({ ...EMPTY, adminEnabled: true, providerId: form.providerId });
      await load();
    } catch (err) { toast(err instanceof Error ? err.message : 'Create failed', 'error'); } finally { setLoading(false); }
  }

  async function toggle(m: ModelRow) {
    try {
      await api(`/api/admin/models/${m.id}`, { method: 'PATCH', body: JSON.stringify({ adminEnabled: !m.adminEnabled }) });
      await load();
    } catch (err) { toast(err instanceof Error ? err.message : 'Update failed', 'error'); }
  }

  async function remove(m: ModelRow) {
    if (!confirm(`Delete model "${m.slug}"?`)) return;
    try {
      await api(`/api/admin/models/${m.id}`, { method: 'DELETE' });
      toast('Model deleted.', 'success');
      await load();
    } catch (err) { toast(err instanceof Error ? err.message : 'Delete failed', 'error'); }
  }

  return (
    <div>
      <h1 className="text-2xl font-extrabold tracking-tight">Models</h1>
      <p className="mt-1 mb-8 text-sm text-ink-soft dark:text-white/60">
        Register provider model slugs and set pricing multipliers. Disabled models are invisible to users.
      </p>

      <form onSubmit={create} className="card mb-8 grid gap-4 p-6 sm:grid-cols-3">
        <label className="text-sm font-medium">
          Provider
          <select className="input mt-1.5" value={form.providerId} onChange={(e) => setForm({ ...form, providerId: e.target.value })} required>
            <option value="">Select…</option>
            {providers.map((p) => <option key={p.id} value={p.id}>{p.name}{p.keyConfigured ? '' : ' (no key)'}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">
          Slug (provider's model name)
          <input className="input mt-1.5" required value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="mistral-small-latest" />
        </label>
        <label className="text-sm font-medium">
          Display name
          <input className="input mt-1.5" required value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder="Mistral Small" />
        </label>
        <label className="text-sm font-medium">
          Minimum tier
          <select className="input mt-1.5" value={form.tierRequired} onChange={(e) => setForm({ ...form, tierRequired: e.target.value })}>
            <option value="free">free</option>
            <option value="pro">pro</option>
            <option value="business">business</option>
          </select>
        </label>
        <label className="text-sm font-medium">
          $/1K input tokens
          <input className="input mt-1.5" type="number" step="0.0001" min="0" value={form.costPer1kInput} onChange={(e) => setForm({ ...form, costPer1kInput: Number(e.target.value) })} />
        </label>
        <label className="text-sm font-medium">
          $/1K output tokens
          <input className="input mt-1.5" type="number" step="0.0001" min="0" value={form.costPer1kOutput} onChange={(e) => setForm({ ...form, costPer1kOutput: Number(e.target.value) })} />
        </label>
        <div className="sm:col-span-3">
          <button className="btn-primary px-6 py-2.5 text-sm" disabled={loading || !form.providerId}>{loading ? 'Creating…' : 'Add model'}</button>
        </div>
      </form>

      {!models && <div className="skeleton h-40" />}
      {models?.length === 0 && <div className="card p-10 text-center text-sm text-ink-soft dark:text-white/60">No models registered yet.</div>}
      {models && models.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-black/5 text-xs uppercase tracking-wide text-ink-soft dark:border-white/10 dark:text-white/50">
                <th className="px-5 py-3">Slug</th><th className="px-5 py-3">Name</th><th className="px-5 py-3">Provider</th>
                <th className="px-5 py-3">Tier</th><th className="px-5 py-3">$ in/out per 1K</th><th className="px-5 py-3">Visible</th><th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {models.map((m) => (
                <tr key={m.id} className="border-b border-black/5 last:border-0 dark:border-white/5">
                  <td className="px-5 py-3 font-mono text-xs">{m.slug}</td>
                  <td className="px-5 py-3">{m.displayName}</td>
                  <td className="px-5 py-3">{m.providerName ?? m.provider?.name}</td>
                  <td className="px-5 py-3">{m.tierRequired}</td>
                  <td className="px-5 py-3">${Number(m.costPer1kInput).toFixed(4)} / ${Number(m.costPer1kOutput).toFixed(4)}</td>
                  <td className="px-5 py-3">
                    <button onClick={() => toggle(m)} className={`rounded-full px-3 py-1 text-xs font-semibold ${m.adminEnabled ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200' : 'bg-black/10 dark:bg-white/10'}`}>
                      {m.adminEnabled ? 'enabled' : 'hidden'}
                    </button>
                  </td>
                  <td className="px-5 py-3 text-right"><button className="text-xs text-red-500 hover:underline" onClick={() => remove(m)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
