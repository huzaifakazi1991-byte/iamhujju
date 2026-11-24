'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useToast } from '@/components/toast';
import { api } from '@/lib/client';

type UserRow = {
  id: string; email: string; name: string | null; role: 'USER' | 'ADMIN'; suspended: boolean;
  createdAt: string; available: number; lifetimeUsed: number; planName: string; online?: boolean;
  whatsappPhone?: string | null; whatsapp?: 'on' | 'muted' | 'off';
};

const waLabel = (s: UserRow['whatsapp']) => s === 'on' ? 'connected' : s === 'muted' ? 'paused by user' : 'not connected';

type CreditMode = 'add' | 'reduce' | 'set';

const QUICK_STEPS = [1_000, 10_000, 50_000, 100_000];

export default function AdminUsersPage() {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [q, setQ] = useState('');
  const [grant, setGrant] = useState<Record<string, string>>({});
  const [armDelete, setArmDelete] = useState<string | null>(null);
  const [credits, setCredits] = useState<UserRow | null>(null);
  const [creditMode, setCreditMode] = useState<CreditMode>('add');
  const [creditAmount, setCreditAmount] = useState('');
  const [creditBusy, setCreditBusy] = useState(false);
  const [waUser, setWaUser] = useState<UserRow | null>(null);
  const [waPhone, setWaPhone] = useState('');
  const [waBusy, setWaBusy] = useState(false);

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

  async function doGrant(u: UserRow, amount: number) {
    if (!Number.isFinite(amount) || amount === 0) return;
    try {
      const d = await api<{ available: number }>('/api/admin/grant', { method: 'POST', body: JSON.stringify({ userId: u.id, amount }) });
      toast(amount < 0
        ? `Reduced ${u.email} by ${(Math.min(0, amount) * -1).toLocaleString()} tokens (new balance ${d.available.toLocaleString()}).`
        : `Added ${amount.toLocaleString()} tokens to ${u.email} (new balance ${d.available.toLocaleString()}).`, 'success');
      setGrant((g) => ({ ...g, [u.id]: '' }));
      await load(q);
    } catch (err) { toast(err instanceof Error ? err.message : 'Grant failed', 'error'); }
  }

  async function applyCredits() {
    if (!credits || creditBusy) return;
    const n = Number(creditAmount);
    if (!Number.isFinite(n) || (creditMode !== 'set' && n === 0) || (creditMode === 'set' && n < 0)) {
      toast(creditMode === 'set' ? 'Enter a target balance ≥ 0.' : 'Enter a non-zero amount.', 'error');
      return;
    }
    setCreditBusy(true);
    try {
      const body = creditMode === 'set'
        ? { userId: credits.id, setTo: Math.round(n) }
        : { userId: credits.id, amount: creditMode === 'reduce' ? -Math.round(n) : Math.round(n) };
      const d = await api<{ available: number; unchanged?: boolean }>('/api/admin/grant', { method: 'POST', body: JSON.stringify(body) });
      const label = creditMode === 'set'
        ? d.unchanged ? 'already at that balance' : `balance set to ${d.available.toLocaleString()}`
        : creditMode === 'reduce'
          ? `reduced by ${Math.min(n, credits.available).toLocaleString()} → ${d.available.toLocaleString()}`
          : `added ${Math.round(n).toLocaleString()} → ${d.available.toLocaleString()}`;
      toast(`${credits.email}: ${label}.`, 'success');
      setCredits(null);
      await load(q);
    } catch (err) { toast(err instanceof Error ? err.message : 'Credit change failed', 'error'); }
    finally { setCreditBusy(false); }
  }

  async function saveWhatsApp(link: boolean) {
    if (!waUser || waBusy) return;
    if (link && waPhone.trim().length < 8) { toast('Enter the user\'s WhatsApp number, e.g. +91 98765 43210.', 'error'); return; }
    setWaBusy(true);
    try {
      const d = await api<{ whatsapp?: string }>(`/api/admin/users/${waUser.id}`, { method: 'PATCH', body: JSON.stringify({ whatsappPhone: link ? waPhone : null }) });
      toast(link
        ? `${waUser.email}: WhatsApp connected (${d.whatsapp}). Their DMs will be mirrored there.`
        : `${waUser.email}: WhatsApp disconnected.`, 'success');
      setWaUser(null);
      await load(q);
    } catch (err) { toast(err instanceof Error ? err.message : 'WhatsApp update failed', 'error'); }
    finally { setWaBusy(false); }
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
      <p className="mt-1 mb-6 text-sm text-ink-soft dark:text-white/60">Search, inspect chats, add or reduce credits, suspend/terminate, promote or permanently remove users.</p>

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
                <th className="px-5 py-3">Role</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Quick grant</th><th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className={`border-b border-black/5 last:border-0 dark:border-white/5 ${u.suspended ? 'opacity-70' : ''}`}>
                  <td className="px-5 py-3">
                    <span className="flex items-center gap-2">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${u.online ? 'bg-green-500' : 'bg-neutral-400'}`} title={u.online ? 'Online now' : 'Offline'} />
                      <span className="truncate">{u.email}</span>
                      <button
                        onClick={() => { setWaUser(u); setWaPhone(u.whatsappPhone ?? ''); }}
                        title={`WhatsApp: ${waLabel(u.whatsapp)} — click to edit`}
                        className={`shrink-0 text-xs ${u.whatsappPhone ? 'opacity-80' : 'opacity-30 grayscale'} hover:opacity-100`}
                      >📲</button>
                    </span>
                  </td>
                  <td className="px-5 py-3">{u.planName}</td>
                  <td className="px-5 py-3">
                    <button className="underline decoration-dotted underline-offset-4 hover:text-leaf" onClick={() => { setCredits(u); setCreditMode('add'); setCreditAmount(''); }} title="Edit credits">{u.available.toLocaleString()}</button>
                  </td>
                  <td className="px-5 py-3">
                    <button className="btn-ghost px-3 py-1 text-xs" onClick={() => patch(u, { role: u.role === 'ADMIN' ? 'USER' : 'ADMIN' })}>{u.role}</button>
                  </td>
                  <td className="px-5 py-3">
                    {u.suspended
                      ? <button className="pill pill-danger" onClick={() => void restore(u)} title="Click to restore access">terminated</button>
                      : <button className="pill pill-active" onClick={() => void terminate(u)} title="Click to terminate access">active</button>}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1.5">
                      <input className="input w-24 py-1 text-xs" type="number" placeholder="±amount" value={grant[u.id] ?? ''} onChange={(e) => setGrant((g) => ({ ...g, [u.id]: e.target.value }))} title="Positive adds credits, negative reduces them" />
                      <button className="btn-ghost px-3 py-1 text-xs" onClick={() => doGrant(u, Number(grant[u.id]))}>Apply</button>
                      <button className="btn-leaf px-3 py-1 text-xs" onClick={() => { setCredits(u); setCreditMode('add'); setCreditAmount(''); }}>Credits</button>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-2 text-xs">
                      <span className="hidden text-ink-soft dark:text-white/50 sm:inline">lifetime {u.lifetimeUsed.toLocaleString()}</span>
                      <Link className="btn-ghost px-3 py-1 text-xs" href={`/admin/messages?user=${encodeURIComponent(u.email)}`}>Message</Link>
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

      {waUser && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-forest/50 p-4 backdrop-blur-sm"
          onPointerDown={(e) => { if (e.target === e.currentTarget) setWaUser(null); }}
        >
          <div className="glass card w-full max-w-md p-6" role="dialog" aria-label={`WhatsApp for ${waUser.email}`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-lg font-bold">💬 WhatsApp — {waLabel(waUser.whatsapp)}</h2>
                <p className="mt-0.5 truncate text-sm text-ink-soft dark:text-white/60">{waUser.email}</p>
              </div>
              <button className="h-11 w-11 rounded-full text-lg text-body-soft hover:bg-forest/8 dark:hover:bg-white/10" onClick={() => setWaUser(null)} aria-label="Close WhatsApp editor">✕</button>
            </div>

            <label className="mt-4 block text-sm font-medium">
              Their WhatsApp number
              <input
                className="input mt-1.5"
                value={waPhone}
                onChange={(e) => setWaPhone(e.target.value)}
                placeholder="+91 98765 43210"
                inputMode="tel"
                maxLength={24}
                autoFocus
              />
            </label>

            <p className="mt-3 rounded-xl bg-amber/15 px-3 py-2 text-xs text-forest dark:text-cream">
              Only add numbers the user agreed to (opt-in — Meta bans numbers that message strangers). The
              first message to a user who never wrote to your WhatsApp needs an approved template
              (WHATSAPP_TEMPLATE_NAME); after they reply once, plain messages flow freely for 24h.
            </p>

            <div className="mt-4 flex items-center justify-between gap-2">
              {waUser.whatsappPhone
                ? <button className="btn-ghost px-4 py-2 text-xs text-red-600 dark:text-red-400" disabled={waBusy} onClick={() => void saveWhatsApp(false)}>Disconnect</button>
                : <span />}
              <button className="btn-primary px-6 py-2.5 text-sm disabled:opacity-60" disabled={waBusy || waPhone.trim().length < 8} onClick={() => void saveWhatsApp(true)}>
                {waBusy ? 'Saving…' : waUser.whatsappPhone ? 'Update number' : 'Connect number'}
              </button>
            </div>
          </div>
        </div>
      )}

      {credits && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-forest/50 p-4 backdrop-blur-sm"
          onPointerDown={(e) => { if (e.target === e.currentTarget) setCredits(null); }}
        >
          <div className="glass card w-full max-w-md p-6" role="dialog" aria-label={`Edit credits for ${credits.email}`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-lg font-bold">Edit credits</h2>
                <p className="mt-0.5 truncate text-sm text-ink-soft dark:text-white/60">{credits.email}</p>
              </div>
              <button className="h-11 w-11 rounded-full text-lg text-body-soft hover:bg-forest/8 dark:hover:bg-white/10" onClick={() => setCredits(null)} aria-label="Close credits editor">✕</button>
            </div>

            <div className="glass mt-4 rounded-xl p-4 text-sm">
              <div className="flex justify-between"><span className="text-ink-soft dark:text-white/60">Current balance</span><span className="font-semibold">{credits.available.toLocaleString()} tokens</span></div>
              <div className="flex justify-between"><span className="text-ink-soft dark:text-white/60">Lifetime used</span><span>{credits.lifetimeUsed.toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-ink-soft dark:text-white/60">Plan</span><span>{credits.planName}</span></div>
            </div>

            <div className="glass mt-3 grid grid-cols-3 gap-1 rounded-full p-1 text-xs font-semibold" role="tablist" aria-label="Credit mode">
              {(['add', 'reduce', 'set'] as CreditMode[]).map((m) => (
                <button
                  key={m}
                  role="tab"
                  aria-selected={creditMode === m}
                  className={`rounded-full px-3 py-2 transition-colors ${creditMode === m ? 'bg-leaf-deep text-cream' : 'hover:bg-forest/8 dark:hover:bg-white/10'}`}
                  onClick={() => setCreditMode(m)}
                >
                  {m === 'add' ? '➕ Add' : m === 'reduce' ? '➖ Reduce' : '🎯 Set exact'}
                </button>
              ))}
            </div>

            <div className="mt-3">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-soft dark:text-white/50">
                {creditMode === 'set' ? 'Set balance to' : creditMode === 'add' ? 'Add tokens' : 'Reduce tokens'}
              </label>
              <input
                className="input w-full text-base"
                type="number"
                min={creditMode === 'set' ? 0 : 1}
                placeholder={creditMode === 'set' ? 'e.g. 50000' : 'e.g. 10000'}
                value={creditAmount}
                onChange={(e) => setCreditAmount(e.target.value)}
                autoFocus
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {creditMode === 'set'
                  ? <button className="btn-ghost px-3 py-1 text-xs" onClick={() => setCreditAmount('0')}>0</button>
                  : QUICK_STEPS.map((step) => (
                    <button
                      key={step}
                      className="btn-ghost px-3 py-1 text-xs"
                      onClick={() => setCreditAmount(String(creditMode === 'reduce' ? Math.min(step, credits.available) : step))}
                    >
                      {creditMode === 'add' ? '+' : '−'}{step >= 1000 ? `${step / 1000}K` : step}
                    </button>
                  ))}
              </div>
              {creditMode === 'set' && <p className="mt-2 text-xs text-ink-soft dark:text-white/50">Sets the balance to this exact number (the delta is applied and audited automatically).</p>}
              {creditMode === 'reduce' && <p className="mt-2 text-xs text-ink-soft dark:text-white/50">Reduction stops at zero — the balance can never go below 0.</p>}
            </div>

            <button className="btn-primary mt-4 w-full py-2.5 disabled:opacity-60" disabled={creditBusy} onClick={() => void applyCredits()}>
              {creditBusy ? 'Applying…' : creditMode === 'set' ? 'Set balance' : creditMode === 'add' ? 'Add credits' : 'Reduce credits'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
