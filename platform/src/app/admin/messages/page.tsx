'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { useToast } from '@/components/toast';
import { api, ApiError } from '@/lib/client';

type WaState = 'on' | 'muted' | 'off';
type ThreadRow = {
  id: string;
  user: { id: string; email: string; name: string | null; avatarUrl: string | null; online: boolean; whatsapp?: WaState };
  lastMessage: { body: string; senderId: string; createdAt: string } | null;
  unread: number;
};
type DirectMessage = { id: string; threadId: string; senderId: string; body: string; createdAt: string };
type ThreadDetail = { threadId: string; user: ThreadRow['user']; me: string; messages: DirectMessage[]; unreadFromUser: number };
const WA_HINT: Record<WaState, string> = {
  on: 'WhatsApp connected — replies are also delivered there',
  muted: 'WhatsApp connected but user paused notifications',
  off: 'WhatsApp not connected — user must add their number in Settings',
};

function AdminMessagesInner() {
  const { toast } = useToast();
  const params = useSearchParams();
  const [threads, setThreads] = useState<ThreadRow[] | null>(null);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async (query = '') => {
    try { const d = await api<{ threads: ThreadRow[] }>(`/api/admin/threads${query ? `?q=${encodeURIComponent(query)}` : ''}`); setThreads(d.threads); }
    catch (err) { toast(err instanceof Error ? err.message : 'Load failed', 'error'); }
  }, [toast]);

  const loadDetail = useCallback(async (id: string) => {
    try { const d = await api<ThreadDetail>(`/api/admin/threads/${id}`); setDetail(d); setSelected(id); }
    catch (err) { toast(err instanceof Error ? err.message : 'Load failed', 'error'); }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const want = params.get('user'); if (want && threads) { const t = threads.find((x) => x.user.email.toLowerCase() === want.toLowerCase()); if (t) void loadDetail(t.id); } }, [params, threads, loadDetail]);

  useEffect(() => {
    const poll = window.setInterval(() => {
      if (document.hidden) return;
      void load(q);
      if (selected) void loadDetailApi();
      async function loadDetailApi() { if (selected) try { const d = await api<ThreadDetail>(`/api/admin/threads/${selected}`); setDetail(d); } catch { /* keep last */ } }
    }, 5000);
    return () => window.clearInterval(poll);
  }, [load, loadDetail, selected, q]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [detail?.messages.length]);

  async function open(id: string) { await loadDetail(id); }

  async function send() {
    const body = input.trim();
    if (!body || busy || !selected) return;
    setBusy(true);
    try {
      setInput('');
      const res = await api<{ whatsapp?: { status: string; reason?: string } }>(`/api/admin/threads/${selected}`, { method: 'POST', body: JSON.stringify({ body }) });
      await loadDetail(selected);
      await load(q);
      const st = res.whatsapp?.status;
      if (st === 'sent') toast('Delivered in-app + WhatsApp ✅', 'success');
      else if (st === 'failed') toast(`In-app sent, but WhatsApp failed: ${res.whatsapp?.reason ?? 'unknown error'}`, 'error');
      else if (st === 'skipped_not_connected' || st === 'skipped_opted_out') toast('Sent in-app only — user has no connected WhatsApp.', 'info');
    } catch (err) {
      setInput(body);
      toast(err instanceof ApiError ? err.message : 'Reply failed.', 'error');
    } finally { setBusy(false); }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Messages</h1>
      <p className="mt-1 mb-6 text-sm text-ink-soft dark:text-white/60">Direct inbox — every user gets a private thread with you. Green dot = online now (updated live).</p>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="glass card p-0">
          <form className="flex gap-2 p-3" onSubmit={(e) => { e.preventDefault(); load(q); }}>
            <input className="input flex-1 py-1.5 text-xs" placeholder="Search users…" value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="btn-ghost px-3 py-1 text-xs">Search</button>
          </form>
          <div className="max-h-[60vh] overflow-y-auto">
            {!threads && <div className="skeleton m-3 h-40" />}
            {threads?.length === 0 && <p className="px-4 py-8 text-center text-xs text-ink-soft dark:text-white/55">No conversations yet. Users can message you from the Messages page.</p>}
            {threads?.map((t) => (
              <button
                key={t.id}
                onClick={() => void open(t.id)}
                className={`flex w-full items-center gap-3 border-b border-black/5 px-4 py-3 text-left transition-colors last:border-0 hover:bg-leaf/8 dark:border-white/5 dark:hover:bg-leaf/10 ${selected === t.id ? 'bg-leaf/10' : ''}`}
              >
                <span className="relative shrink-0">
                  {t.user.avatarUrl
                    ? <img src={t.user.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
                    : <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-leaf-deep to-leaf text-[10px] font-bold text-cream">{(t.user.name?.trim() || t.user.email).slice(0, 2).toUpperCase()}</span>}
                  <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-cream dark:ring-forest ${t.user.online ? 'bg-green-500' : 'bg-neutral-400'}`} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold">{t.user.name?.trim() || t.user.email}</span>
                  <span className="block truncate text-[11px] text-ink-soft dark:text-white/50">{t.lastMessage ? t.lastMessage.body.slice(0, 42) : 'No messages yet'}</span>
                </span>
                {t.unread > 0 && <span className="shrink-0 rounded-full bg-amber px-1.5 py-0.5 text-[10px] font-bold text-forest dark:text-forest">{t.unread}</span>}
                <span title={WA_HINT[t.user.whatsapp ?? 'off']} className="shrink-0 text-[11px] opacity-70">{t.user.whatsapp === 'on' ? '📲' : t.user.whatsapp === 'muted' ? '🔕' : ''}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="glass card flex min-h-[60vh] flex-col overflow-hidden p-0">
          {!detail && (
            <div className="flex flex-1 items-center justify-center text-sm text-ink-soft dark:text-white/55">Select a conversation to read and reply.</div>
          )}
          {detail && (
            <>
              <div className="flex items-center gap-3 border-b border-black/5 px-4 py-3 dark:border-white/10">
                <span className={`h-2.5 w-2.5 rounded-full ${detail.user.online ? 'bg-green-500' : 'bg-neutral-400'}`} />
                <div>
                  <p className="text-sm font-semibold">{detail.user.name?.trim() || detail.user.email} {detail.user.whatsapp && detail.user.whatsapp !== 'off' && <span title={WA_HINT[detail.user.whatsapp]} className="text-xs opacity-70">{detail.user.whatsapp === 'on' ? '📲' : '🔕'}</span>}</p>
                  <p className="text-xs text-ink-soft dark:text-white/55">{detail.user.email} · {detail.user.online ? 'online' : 'offline'}</p>
                </div>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
                {detail.messages.length === 0 && <p className="py-8 text-center text-xs text-ink-soft dark:text-white/55">No messages yet.</p>}
                {detail.messages.map((m) => {
                  const isMine = m.senderId === detail.me;
                  return (
                    <motion.div key={m.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[75%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm ${isMine ? 'rounded-br-md bg-leaf-deep text-cream' : 'rounded-bl-md border border-forest/10 bg-cream/70 dark:border-white/10 dark:bg-white/5'}`}>
                        {m.body}
                        <p className={`mt-1 text-right text-[10px] ${isMine ? 'text-cream/60' : 'text-ink-soft/70 dark:text-white/40'}`}>{new Date(m.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</p>
                      </div>
                    </motion.div>
                  );
                })}
                <div ref={bottomRef} />
              </div>
              <form className="flex gap-2 border-t border-black/5 p-3 dark:border-white/10" onSubmit={(e) => { e.preventDefault(); void send(); }}>
                <input className="input flex-1" placeholder="Reply as Huzaifa…" value={input} maxLength={2000} onChange={(e) => setInput(e.target.value)} aria-label="Reply" />
                <button className="btn-leaf px-5 text-sm" disabled={busy || !input.trim()}>{busy ? '…' : 'Send'}</button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AdminMessagesPage() {
  return (
    <Suspense fallback={<div className="skeleton h-64" />}>
      <AdminMessagesInner />
    </Suspense>
  );
}
