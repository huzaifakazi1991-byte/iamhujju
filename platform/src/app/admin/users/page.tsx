'use client';

import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/components/toast';
import { api } from '@/lib/client';

type UserRow = {
  id: string; email: string; name: string | null; role: 'USER' | 'ADMIN'; suspended: boolean;
  createdAt: string; available: number; lifetimeUsed: number; planName: string;
};

export default function AdminUsersPage() {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [q, setQ] = useState('');
  const [grant, setGrant] = useState<Record<string, string>>({});

  const load = useCallback(async (query = '') => {
    try {
      const d = await api<{ users: UserRow[] }>(`/api/admin/users${query ? `?q=${encodeURIComponent(query)}` : ''}`);
      setUsers(d.users);
    } catch (err) { toast(err instanceof Error ? err.message : 'Load failed', 'error'); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  async function patch(u: UserRow, data: Record<string, unknown>) {
    try {
      await api(`/api/admin/users/${u.id}`, { method: 'PATCH', body: JSON.stringify(data) });
      toast(`${u.email} updated.`, 'success');
      await load(q);
    } catch (err) { toast(err instanceof Error ? err.message : 'Update failed', 'error'); }
  }

  async function doGrant(u: UserRow) {
    const amount = Number(grant[u.id]);
    if (!Number.isFinite(amount) || amount === 0) return;
    try {
      const d = await api<{ available: number }>('/api/admin/grant', { method: 'POST', body: JSON.stringify({ userId: u.id, amount }) });
      toast(`Granted ${amount.toLocaleString()} tokens to ${u.email} (new balance ${d.available.toLocaleString()}).`, 'success');
      setGrant((g) => ({ ...g, [u.id]: '' }));
      await load(q);
    } catch (err) { toast(err instanceof Error ? err.message : 'Grant failed', 'error'); }
  }

  return (
    <div>
      <h1 className="text-2xl font-extrabold tracking-tight">Users</h1>
      <p className="mt-1 mb-6 text-sm text-ink-soft dark:text-white/60">Search, suspend, promote and grant tokens.</p>

      <form className="mb-6 flex gap-2" onSubmit={(e) => { e.preventDefault(); load(q); }}>
        <input className="input max-w-sm" placeholder="Search by email or name…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn-primary px-5 text-sm">Search</button>
      </form>

      {!users && <div className="skeleton h-64" />}
      {users?.length === 0 && <div className="card p-10 text-center text-sm text-ink-soft dark:text-white/60">No users match.</div>}
      {users && users.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-black/5 text-xs uppercase tracking-wide text-ink-soft dark:border-white/10 dark:text-white/50">
                <th className="px-5 py-3">Email</th><th className="px-5 py-3">Plan</th><th className="px-5 py-3">Balance</th>
                <th className="px-5 py-3">Role</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Grant tokens</th><th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-black/5 last:border-0 dark:border-white/5">
                  <td className="px-5 py-3">{u.email}</td>
                  <td className="px-5 py-3">{u.planName}</td>
                  <td className="px-5 py-3">{u.available.toLocaleString()}</td>
                  <td className="px-5 py-3">
                    <button className="btn-ghost px-3 py-1 text-xs" onClick={() => patch(u, { role: u.role === 'ADMIN' ? 'USER' : 'ADMIN' })}>{u.role}</button>
                  </td>
                  <td className="px-5 py-3">
                    {u.suspended
                      ? <button className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700 dark:bg-red-900 dark:text-red-200" onClick={() => patch(u, { suspended: false })}>suspended</button>
                      : <button className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700 dark:bg-green-900 dark:text-green-200" onClick={() => patch(u, { suspended: true })}>active</button>}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex gap-1.5">
                      <input className="input w-28 py-1 text-xs" type="number" placeholder="±amount" value={grant[u.id] ?? ''} onChange={(e) => setGrant((g) => ({ ...g, [u.id]: e.target.value }))} />
                      <button className="btn-ghost px-3 py-1 text-xs" onClick={() => doGrant(u)}>Apply</button>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right text-xs text-ink-soft dark:text-white/50">
                    lifetime {u.lifetimeUsed.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
