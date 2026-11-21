'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
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
  const [armDelete, setArmDelete] = useState<string | null>(null);

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

  async function terminate(u: UserRow) {
    try {
      await api(`/api/admin/users/${u.id}`, { method: 'PATCH', body: JSON.stringify({ suspended: true, forceLogout: true }) });
      toast(`${u.email} terminated — signed out everywhere and blocked from signing back in.`, 'success');
      await load(q);
    } catch (err) { toast(err instanceof Error ? err.message : 'Terminate failed', 'error'); }
  }

  async function restore(u: UserRow) {
    try {
      await api(`/api/admin/users/${u.id}`, { method: 'PATCH', body: JSON.stringify({ suspended: false }) });
      toast(`${u.email} restored — they can sign in again.`, 'success');
      await load(q);
    } catch (err) { toast(err instanceof Error ? err.message : 'Restore failed', 'error'); }
  }

  async function removeUser(u: UserRow) {
    if (armDelete !== u.id) {
      setArmDelete(u.id);
      toast(`Press Delete again to permanently remove ${u.email} and all their data.`, 'error');
      return;
    }
    try {
      await api(`/api/admin/users/${u.id}`, { method: 'DELETE' });
      toast(`${u.email} and all their data were permanently removed.`, 'success');
      setArmDelete(null);
      await load(q);
    } catch (err) { toast(err instanceof Error ? err.message : 'Delete failed', 'error'); }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Users</h1>
      <p className="mt-1 mb-6 text-sm text-ink-soft dark:text-white/60">Search, inspect chats, grant tokens, suspend/terminate, promote or permanently remove users.</p>

      <form className="mb-6 flex gap-2" onSubmit={(e) => { e.preventDefault(); load(q); }}>
        <input className="input max-w-sm" placeholder="Search by email or name…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn-primary px-5 text-sm">Search</button>
      </form>

      {!users && <div className="skeleton h-64" />}
      {users?.length === 0 && <div className="card p-10 text-center text-sm text-ink-soft dark:text-white/60">No users match.</div>}
      {users && users.length > 0 && (
        <div className="card overflow-x-auto glass">
          <table className="table-glass">
            <thead>
              <tr className="border-b border-black/5 text-xs uppercase tracking-wide text-ink-soft dark:border-white/10 dark:text-white/50">
                <th className="px-5 py-3">Email</th><th className="px-5 py-3">Plan</th><th className="px-5 py-3">Balance</th>
                <th className="px-5 py-3">Role</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Grant tokens</th><th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className={`border-b border-black/5 last:border-0 dark:border-white/5 ${u.suspended ? 'opacity-70' : ''}`}>
                  <td className="px-5 py-3">{u.email}</td>
                  <td className="px-5 py-3">{u.planName}</td>
                  <td className="px-5 py-3">{u.available.toLocaleString()}</td>
                  <td className="px-5 py-3">
                    <button className="btn-ghost px-3 py-1 text-xs" onClick={() => patch(u, { role: u.role === 'ADMIN' ? 'USER' : 'ADMIN' })}>{u.role}</button>
                  </td>
                  <td className="px-5 py-3">
                    {u.suspended
                      ? <button className="pill pill-danger" onClick={() => void restore(u)} title="Click to restore access">terminated</button>
                      : <button className="pill pill-active" onClick={() => void terminate(u)} title="Click to terminate access">active</button>}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex gap-1.5">
                      <input className="input w-28 py-1 text-xs" type="number" placeholder="±amount" value={grant[u.id] ?? ''} onChange={(e) => setGrant((g) => ({ ...g, [u.id]: e.target.value }))} />
                      <button className="btn-ghost px-3 py-1 text-xs" onClick={() => doGrant(u)}>Apply</button>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-2 text-xs">
                      <span className="hidden text-ink-soft dark:text-white/50 sm:inline">lifetime {u.lifetimeUsed.toLocaleString()}</span>
                      <Link className="btn-ghost px-3 py-1 text-xs" href={`/admin/logs?q=${encodeURIComponent(u.email)}`}>Chats</Link>
                      {!u.suspended && <button className="btn-ghost px-3 py-1 text-xs" onClick={() => void terminate(u)}>Terminate</button>}
                      <button className="btn-ghost px-3 py-1 text-xs text-red-500" onClick={() => void removeUser(u)}>{armDelete === u.id ? 'Confirm delete' : 'Delete'}</button>
                    </div>
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
