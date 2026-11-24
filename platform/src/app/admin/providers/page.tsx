'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Nav } from '@/components/nav';
import { useToast } from '@/components/toast';
import { api } from '@/lib/client';
import { PROVIDER_CATALOG } from '@/lib/gateway/catalog';

type Provider = {
  id: string; name: string; baseUrl: string | null; enabled: boolean; keyConfigured: boolean;
  lastTestAt: string | null; lastTestOk: boolean | null; lastTestDetail: string | null;
  models: { id: string; slug: string; displayName: string; adminEnabled: boolean; capability?: string }[];
};

export default function AdminProvidersPage() {
  const { toast } = useToast();
  const [providers, setProviders] = useState<Provider[] | null>(null);
  const [form, setForm] = useState({ name: '', kind: 'custom', baseUrl: '', apiKey: '' });
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [purgeText, setPurgeText] = useState('');
  const [purgeBusy, setPurgeBusy] = useState(false);

  async function load() {
    try {
      const d = await api<{ providers: Provider[] }>('/api/admin/providers');
      setProviders(d.providers);
    } catch (err) { toast(err instanceof Error ? err.message : 'Load failed', 'error'); }
  }

  useEffect(() => { load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const name = form.name || form.kind;
    try {
      await api('/api/admin/providers', { method: 'POST', body: JSON.stringify({ ...form, name }) });
      toast(`Provider "${name}" added. Syncing its models next…`, 'success');
      setForm({ name: '', kind: 'custom', baseUrl: '', apiKey: '' });
      await load();
      const fresh = await api<{ providers: Provider[] }>('/api/admin/providers');
      const created = fresh.providers.find((p) => p.name === name);
      if (created) await syncModels(created);
    } catch (err) { toast(err instanceof Error ? err.message : 'Create failed', 'error'); } finally { setLoading(false); }
  }

  function pickFromCatalog(kind: string) {
    const entry = PROVIDER_CATALOG.find((p) => p.kind === kind);
    if (!entry) return;
    setForm({ name: kind === 'custom' ? '' : entry.kind, kind: entry.kind, baseUrl: entry.baseUrl, apiKey: '' });
    setCatalogOpen(false);
  }

  function timeAgo(iso: string | null): string {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 90_000) return 'just now';
    if (diff < 3_600_000) return `${Math.round(diff / 60_000)} min ago`;
    if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)} h ago`;
    return `${Math.round(diff / 86_400_000)} d ago`;
  }

  async function patch(id: string, data: Record<string, unknown>) {
    try {
      const d = await api<{ provider: { name: string } }>(`/api/admin/providers/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
      if (data.apiKey) setKeyInputs((k) => ({ ...k, [id]: '' }));
      toast(`Saved: ${d.provider.name}`, 'success');
      await load();
      if (data.apiKey) {
        toast(`Running connection test for ${d.provider.name}…`);
        await preflightById(id, d.provider.name);
        await load();
      }
    } catch (err) { toast(err instanceof Error ? err.message : 'Update failed', 'error'); }
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Delete provider "${name}"?`)) return;
    try {
      await api(`/api/admin/providers/${id}`, { method: 'DELETE' });
      toast('Provider deleted.', 'success');
      await load();
    } catch (err) { toast(err instanceof Error ? err.message : 'Delete failed', 'error'); }
  }

  async function purgeAll() {
    if (purgeBusy) return;
    if (purgeText !== 'DELETE') { toast('Type DELETE exactly to confirm.', 'error'); return; }
    setPurgeBusy(true);
    try {
      const d = await api<{ providers: number; models: number }>(`/api/admin/catalog`, { method: 'DELETE', body: JSON.stringify({ confirm: purgeText }) });
      toast(`Purged: ${d.providers} providers, ${d.models} models. Billing history kept.`, 'success');
      setPurgeOpen(false);
      setPurgeText('');
      await load();
    } catch (err) { toast(err instanceof Error ? err.message : 'Purge failed', 'error'); }
    finally { setPurgeBusy(false); }
  }

  async function preflightById(id: string, name: string) {
    try {
      const d = await api<{ ok?: boolean; error?: string; latencyMs?: number }>(`/api/admin/providers/${id}/test`, { method: 'POST' });
      if (d.error) toast(`❌ ${name}: ${d.error}`, 'error');
      else toast(`✅ ${name} reachable (${d.latencyMs ?? '?'} ms)`, 'success');
    } catch (err) { toast(err instanceof Error ? err.message : 'Test failed', 'error'); }
  }

  async function preflight(p: Provider) {
    toast(`Pinging ${p.name}…`);
    await preflightById(p.id, p.name);
    await load();
  }

  async function syncModels(p: Provider) {
    toast(`Listing live model ids from ${p.name}…`);
    try {
      const d = await api<{ created: number; disabled: number; createdSlugs: string[]; disabledSlugs: string[]; upstreamCount: number }>(`/api/admin/providers/${p.id}/models`, { method: 'POST' });
      const parts = [
        `${d.created} added`,
        d.disabled > 0 ? `${d.disabled} hidden (unknown to this key)` : null,
        `${d.upstreamCount} available upstream`,
      ].filter(Boolean);
      toast(`${p.name}: ${parts.join(' · ')}${d.createdSlugs.length ? ` — new: ${d.createdSlugs.slice(0, 6).join(', ')}${d.createdSlugs.length > 6 ? '…' : ''}` : ''}`, 'success');
      await load();
    } catch (err) { toast(err instanceof Error ? err.message : 'Sync failed', 'error'); }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Providers</h1>
      <p className="mt-1 mb-8 text-sm text-ink-soft dark:text-white/60">
        Keys are AES-256-GCM encrypted server-side and never sent to the browser. A provider goes live the moment its key is saved.
      </p>

      <div className="card mb-8 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-bold">🔌 Add a provider API key</h2>
            <p className="mt-0.5 text-sm text-ink-soft dark:text-white/60">Pick a platform, paste its key — models sync automatically. Keys are encrypted and never leave the server.</p>
          </div>
          {catalogOpen ? (
            <button type="button" className="btn-ghost px-4 py-2 text-sm" onClick={() => setCatalogOpen(false)}>Close catalog</button>
          ) : (
            <button type="button" className="btn-primary px-5 py-2.5 text-sm" onClick={() => setCatalogOpen(true)}>Browse {PROVIDER_CATALOG.length} platforms</button>
          )}
        </div>
        {catalogOpen && (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {PROVIDER_CATALOG.map((c) => (
              <button
                key={c.kind}
                type="button"
                onClick={() => pickFromCatalog(c.kind)}
                className={`rounded-xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-lg ${form.kind === c.kind ? 'border-leaf bg-leaf/10' : 'border-black/8 bg-white/40 dark:border-white/10 dark:bg-white/5'}`}
              >
                <p className="text-sm font-bold">{c.label}</p>
                {c.suggested.length > 0 && <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-ink-soft dark:text-white/50">{c.suggested.map((s) => s.slug).join(', ')}</p>}
                {c.keyUrl && <p className="mt-2 text-[11px] font-medium text-leaf-deep dark:text-leaf">Get a key ↗</p>}
              </button>
            ))}
          </div>
        )}
        <form onSubmit={create} className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium">
            Name (one word, lowercase)
            <input className="input mt-1.5" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value.toLowerCase() })} placeholder={form.kind === 'custom' ? 'my-provider' : form.kind} pattern="[a-z0-9-]{2,60}" />
          </label>
          <label className="text-sm font-medium">
            Type
            <select className="input mt-1.5" value={form.kind} onChange={(e) => pickFromCatalog(e.target.value)}>
              {PROVIDER_CATALOG.map((c) => <option key={c.kind} value={c.kind}>{c.label}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium">
            Base URL {form.kind === 'custom' ? '(required)' : '(prefilled)'}
            <input className="input mt-1.5" value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder="https://api.example.com/v1" />
          </label>
          <label className="text-sm font-medium">
            API key (stored encrypted)
            <input className="input mt-1.5" type="password" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} placeholder="sk-…" />
          </label>
          <div className="sm:col-span-2">
            <button className="btn-primary px-6 py-2.5 text-sm" disabled={loading}>{loading ? 'Adding & syncing…' : 'Add provider'}</button>
          </div>
        </form>
      </div>

      {!providers && <div className="skeleton h-40" />}
      {providers?.length === 0 && <div className="card p-10 text-center text-sm text-ink-soft dark:text-white/60">No providers yet.</div>}
      <div className="grid gap-4">
        {providers?.map((p) => (
          <div key={p.id} className="card p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-bold">
                  {p.name}{' '}
                  <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${p.enabled ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200' : 'bg-black/10 dark:bg-white/10'}`}>{p.enabled ? 'enabled' : 'disabled'}</span>
                  {p.lastTestOk === true && <span className="ml-1.5 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700 dark:bg-green-900/60 dark:text-green-200" title={p.lastTestDetail ?? ''}>✅ live · {timeAgo(p.lastTestAt)}</span>}
                  {p.lastTestOk === false && <span className="ml-1.5 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-600 dark:bg-red-900/60 dark:text-red-200" title={p.lastTestDetail ?? ''}>❌ failing · {timeAgo(p.lastTestAt)}</span>}
                </p>
                <p className="mt-0.5 text-xs text-ink-soft dark:text-white/55">
                  Key: {p.keyConfigured ? '🔐 configured' : '⚠️ no key (mock only)'} {p.baseUrl ? `· ${p.baseUrl}` : ''} · {p.models.length} models
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="btn-ghost px-4 py-1.5 text-xs" onClick={() => patch(p.id, { enabled: !p.enabled })}>{p.enabled ? 'Disable' : 'Enable'}</button>
                <button className="btn-ghost px-4 py-1.5 text-xs" onClick={() => preflight(p)}>Test connection</button>
                <button className="btn-ghost px-4 py-1.5 text-xs" onClick={() => syncModels(p)} title="List the model ids this key can actually use; add missing ones and hide unusable ones">Sync models</button>
                <button className="px-4 py-1.5 text-xs text-red-500 hover:underline" onClick={() => remove(p.id, p.name)}>Delete</button>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <input className="input max-w-xs py-1.5 text-sm" type="password" placeholder="Replace key…" value={keyInputs[p.id] ?? ''} onChange={(e) => setKeyInputs((k) => ({ ...k, [p.id]: e.target.value }))} />
              <button className="btn-ghost px-4 py-1.5 text-xs" disabled={!keyInputs[p.id]} onClick={() => patch(p.id, { apiKey: keyInputs[p.id] })}>Save key</button>
            </div>
            {p.models.length > 0 && <p className="mt-3 text-xs text-ink-soft dark:text-white/55">Models: {p.models.map((m) => m.slug).join(', ')}</p>}
          </div>
        ))}
      </div>

      <div className="card mt-8 border-red-300/50 p-6">
        <h2 className="font-bold text-red-600 dark:text-red-300">⚠️ Danger zone</h2>
        <p className="mt-2 text-sm text-ink-soft dark:text-white/65">
          Removes <strong>every provider and every model</strong> from the catalog in one step — all user chats stay, billing history stays, balances stay. User chats simply use whichever model is selected next. You cannot undo this; add providers again afterwards.
        </p>
        <button className="mt-4 rounded-xl bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50" onClick={() => setPurgeOpen(true)}>
          🗑️ Delete all providers & models
        </button>
      </div>

      <div className="card mt-8 p-6">
        <h2 className="font-bold">💡 Adding a provider — tips</h2>
        <ul className="mt-3 list-inside list-disc space-y-1.5 text-sm text-ink-soft dark:text-white/65">
          <li>Adding a key <strong>auto-syncs its models</strong> and runs a live connection test — the result shows as a health pill on the provider card.</li>
          <li>“Test connection” makes a real, tiny request through the gateway using the stored key.</li>
          <li>“Sync models” asks the provider for the exact model ids your key can use — adds missing ones and hides ids the provider no longer serves. Run it whenever a model id is retired or misnamed — no redeploy needed.</li>
          <li>Image/video models (Imagen, DALL·E, FLUX, Veo…) are detected automatically and appear under the <strong>Images</strong>/<strong>Video</strong> modes in the playground.</li>
          <li>Custom providers must be OpenAI-compatible (<code className="font-mono text-xs">POST {'{baseUrl}'}/chat/completions</code> with SSE streaming).</li>
        </ul>
      </div>

      {purgeOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-4" onPointerDown={(e) => { if (e.target === e.currentTarget && !purgeBusy) setPurgeOpen(false); }}>
          <div className="glass-strong w-full max-w-md rounded-3xl p-6" role="dialog" aria-modal="true">
            <h3 className="font-bold text-red-600 dark:text-red-300">Delete ALL providers & models?</h3>
            <p className="mt-2 text-sm text-ink-soft dark:text-white/65">
              This deletes {providers?.reduce((n, p) => n + p.models.length, 0) ?? 0} models across {providers?.length ?? 0} providers. Chats, billing history and balances are kept — but the catalog cannot be restored and must be re-added.
            </p>
            <input className="input mt-4" placeholder="Type DELETE" value={purgeText} onChange={(e) => setPurgeText(e.target.value)} disabled={purgeBusy} />
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn-ghost px-4 py-2 text-sm" onClick={() => { setPurgeOpen(false); setPurgeText(''); }} disabled={purgeBusy}>Cancel</button>
              <button className="rounded-xl bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50" disabled={purgeText !== 'DELETE' || purgeBusy} onClick={purgeAll}>
                {purgeBusy ? 'Purging…' : 'Purge everything'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
