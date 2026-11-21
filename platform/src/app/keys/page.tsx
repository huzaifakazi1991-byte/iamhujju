'use client';

import { useEffect, useState } from 'react';
import { Nav } from '@/components/nav';
import { useToast } from '@/components/toast';
import { api } from '@/lib/client';

type Key = { id: string; name: string; prefix: string; lastUsed: string | null; revoked: boolean; createdAt: string };

export default function KeysPage() {
  const { toast } = useToast();
  const [keys, setKeys] = useState<Key[] | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);

  async function load() {
    try {
      const d = await api<{ keys: Key[] }>('/api/keys');
      setKeys(d.keys);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not load keys', 'error');
    }
  }

  useEffect(() => { load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const d = await api<{ secret: string }>('/api/keys', { method: 'POST', body: JSON.stringify({ name }) });
      setSecret(d.secret);
      setName('');
      await load();
      toast('API key created — copy it now, it is shown only once.', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not create key', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    await api(`/api/keys/${id}`, { method: 'DELETE' }).catch(() => undefined);
    await load();
    toast('Key revoked.', 'success');
  }

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-extrabold tracking-tight">API keys</h1>
        <p className="mt-1 mb-8 text-sm text-ink-soft dark:text-white/60">
          Call the gateway programmatically: <code className="rounded bg-black/5 px-1.5 py-0.5 font-mono text-xs dark:bg-white/10">POST /api/v1/chat/completions</code> with <code className="rounded bg-black/5 px-1.5 py-0.5 font-mono text-xs dark:bg-white/10">Authorization: Bearer &lt;key&gt;</code> (OpenAI-compatible).
        </p>

        <form onSubmit={create} className="card mb-6 flex flex-wrap items-end gap-3 p-6">
          <label className="min-w-0 flex-1 text-sm font-medium">
            Key name
            <input className="input mt-1.5" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. my-backend" maxLength={80} />
          </label>
          <button className="btn-primary px-6 py-2.5 text-sm" disabled={busy}>{busy ? 'Creating…' : 'Create key'}</button>
        </form>

        {secret && (
          <div className="card mb-6 border-agent/40 bg-agent/5 p-6">
            <p className="text-sm font-bold">Copy this key now — it will never be shown again:</p>
            <code className="mt-2 block overflow-x-auto rounded-lg bg-black/80 px-4 py-3 font-mono text-sm text-green-300">{secret}</code>
          </div>
        )}

        {!keys && <div className="skeleton h-40" />}
        {keys && keys.length === 0 && (
          <div className="card p-10 text-center text-sm text-ink-soft dark:text-white/60">No API keys yet. Create one above.</div>
        )}
        {keys && keys.length > 0 && (
          <div className="card overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-black/5 text-xs uppercase tracking-wide text-ink-soft dark:border-white/10 dark:text-white/50">
                  <th className="px-5 py-3">Name</th>
                  <th className="px-5 py-3">Key</th>
                  <th className="px-5 py-3">Created</th>
                  <th className="px-5 py-3">Last used</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id} className="border-b border-black/5 last:border-0 dark:border-white/5">
                    <td className="px-5 py-3 font-medium">{k.name}</td>
                    <td className="px-5 py-3 font-mono text-xs">{k.prefix}…</td>
                    <td className="px-5 py-3">{new Date(k.createdAt).toLocaleDateString()}</td>
                    <td className="px-5 py-3">{k.lastUsed ? new Date(k.lastUsed).toLocaleString() : 'never'}</td>
                    <td className="px-5 py-3">{k.revoked ? <span className="text-red-500">revoked</span> : <span className="text-green-600 dark:text-green-400">active</span>}</td>
                    <td className="px-5 py-3 text-right">
                      {!k.revoked && <button className="btn-ghost px-3 py-1 text-xs" onClick={() => revoke(k.id)}>Revoke</button>}
                    </td>
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
