'use client';

import { useEffect, useState } from 'react';
import { Nav } from '@/components/nav';
import { useToast } from '@/components/toast';
import { api } from '@/lib/client';

type Provider = {
  id: string; name: string; baseUrl: string | null; enabled: boolean; keyConfigured: boolean;
  models: { id: string; slug: string; displayName: string; adminEnabled: boolean }[];
};

const KINDS = ['mistral', 'openai', 'anthropic', 'groq', 'custom'];
const SUGGESTED: Record<string, string> = {
  mistral: 'mistral-small-latest, mistral-large-latest',
  openai: 'gpt-4o, gpt-4o-mini',
  anthropic: 'claude-sonnet-4-20250514',
  groq: 'llama-3.3-70b-versatile',
  custom: 'model-slug-1, model-slug-2',
};

export default function AdminProvidersPage() {
  const { toast } = useToast();
  const [providers, setProviders] = useState<Provider[] | null>(null);
  const [form, setForm] = useState({ name: '', kind: 'custom', baseUrl: '', apiKey: '' });
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

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
    try {
      await api('/api/admin/providers', { method: 'POST', body: JSON.stringify(form) });
      toast(`Provider "${form.name}" added. Add its models next.`, 'success');
      setForm({ name: '', kind: 'custom', baseUrl: '', apiKey: '' });
      await load();
    } catch (err) { toast(err instanceof Error ? err.message : 'Create failed', 'error'); } finally { setLoading(false); }
  }

  async function patch(id: string, data: Record<string, unknown>) {
    try {
      const d = await api<{ provider: { name: string } }>(`/api/admin/providers/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
      if (data.apiKey) setKeyInputs((k) => ({ ...k, [id]: '' }));
      toast(`Saved: ${d.provider.name}`, 'success');
      await load();
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

  async function preflight(p: Provider) {
    toast(`Pinging ${p.name}…`);
    try {
      const d = await api<{ ok?: boolean; error?: string; latencyMs?: number }>(`/api/admin/providers/${p.id}/test`, { method: 'POST' });
      if (d.error) toast(`❌ ${p.name}: ${d.error}`, 'error');
      else toast(`✅ ${p.name} reachable (${d.latencyMs ?? '?'} ms)`, 'success');
      await load();
    } catch (err) { toast(err instanceof Error ? err.message : 'Test failed', 'error'); }
  }

  return (
    <div>
      <h1 className="text-2xl font-extrabold tracking-tight">Providers</h1>
      <p className="mt-1 mb-8 text-sm text-ink-soft dark:text-white/60">
        Keys are AES-256-GCM encrypted server-side and never sent to the browser. A provider goes live the moment its key is saved.
      </p>

      <form onSubmit={create} className="card mb-8 grid gap-4 p-6 sm:grid-cols-2">
        <label className="text-sm font-medium">
          Name (one word, lowercase)
          <input className="input mt-1.5" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value.toLowerCase() })} placeholder="mistral" pattern="[a-z0-9-]{2,60}" />
        </label>
        <label className="text-sm font-medium">
          Type
          <select className="input mt-1.5" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
            {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">
          Base URL {form.kind !== 'custom' ? '(optional override)' : '(required)'}
          <input className="input mt-1.5" value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder="https://api.example.com/v1" />
        </label>
        <label className="text-sm font-medium">
          API key (stored encrypted)
          <input className="input mt-1.5" type="password" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} placeholder="sk-…" />
        </label>
        <div className="sm:col-span-2">
          <button className="btn-primary px-6 py-2.5 text-sm" disabled={loading}>{loading ? 'Adding…' : 'Add provider'}</button>
        </div>
      </form>

      {!providers && <div className="skeleton h-40" />}
      {providers?.length === 0 && <div className="card p-10 text-center text-sm text-ink-soft dark:text-white/60">No providers yet.</div>}
      <div className="grid gap-4">
        {providers?.map((p) => (
          <div key={p.id} className="card p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-bold">{p.name} <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${p.enabled ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200' : 'bg-black/10 dark:bg-white/10'}`}>{p.enabled ? 'enabled' : 'disabled'}</span></p>
                <p className="mt-0.5 text-xs text-ink-soft dark:text-white/55">
                  Key: {p.keyConfigured ? '🔐 configured' : '⚠️ no key (mock only)'} {p.baseUrl ? `· ${p.baseUrl}` : ''} · {p.models.length} models
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="btn-ghost px-4 py-1.5 text-xs" onClick={() => patch(p.id, { enabled: !p.enabled })}>{p.enabled ? 'Disable' : 'Enable'}</button>
                <button className="btn-ghost px-4 py-1.5 text-xs" onClick={() => preflight(p)}>Test connection</button>
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

      <div className="card mt-8 p-6">
        <h2 className="font-bold">💡 Adding a provider — tips</h2>
        <ul className="mt-3 list-inside list-disc space-y-1.5 text-sm text-ink-soft dark:text-white/65">
          <li>After adding a provider, go to <strong>Models</strong> and register its model slugs (e.g. {KINDS.map((k) => SUGGESTED[k]).join(' · ')}) — they go live the moment you enable them.</li>
          <li>“Test connection” makes a real, tiny request through the gateway using the stored key.</li>
          <li>Custom providers must be OpenAI-compatible (<code className="font-mono text-xs">POST {'{baseUrl}'}/chat/completions</code> with SSE streaming).</li>
        </ul>
      </div>
    </div>
  );
}
