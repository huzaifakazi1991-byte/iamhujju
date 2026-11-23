'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { api, ApiError } from '@/lib/client';
import { useToast } from '@/components/toast';

type DirectMessage = { id: string; threadId: string; senderId: string; body: string; createdAt: string };
type GroupMessageRow = { id: string; body: string; createdAt: string; senderId: string; sender: { id: string; name: string | null; role: string; avatarUrl: string | null } };
type OnlineUser = { id: string; name: string | null; role: string; avatarUrl: string | null };

const PRESENCE_WINDOW_MS = 60_000;

function initials(name: string | null, fallback: string) {
  return (name?.trim() || fallback).slice(0, 2).toUpperCase();
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

export default function MessagesPage() {
  const { toast } = useToast();
  const router = useRouter();
  const [tab, setTab] = useState<'direct' | 'group'>('direct');
  const [direct, setDirect] = useState<{ messages: DirectMessage[]; me: string; owner: { name: string; online: boolean } | null } | null>(null);
  const [group, setGroup] = useState<{ messages: GroupMessageRow[]; online: OnlineUser[]; me: string } | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [chatMinimized, setChatMinimized] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const loadDirect = useCallback(() => api<typeof direct>('/api/threads/direct').then((d) => setDirect(d)).catch(() => undefined), []);
  const loadGroup = useCallback(() => api<typeof group>('/api/threads/group').then((d) => setGroup(d)).catch(() => undefined), []);

  useEffect(() => {
    if (tab === 'direct') void loadDirect(); else void loadGroup();
  }, [tab, loadDirect, loadGroup]);

  useEffect(() => {
    const beat = () => void api('/api/presence', { method: 'POST' }).catch(() => undefined);
    beat();
    const presenceTimer = window.setInterval(beat, 30_000);
    const pollTimer = window.setInterval(() => {
      if (document.hidden) return;
      if (tab === 'direct') void loadDirect(); else void loadGroup();
    }, 4000);
    return () => { window.clearInterval(presenceTimer); window.clearInterval(pollTimer); };
  }, [tab, loadDirect, loadGroup]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [direct?.messages.length, group?.messages.length, tab]);

  async function send() {
    const body = input.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      const optimisticBody = body;
      setInput('');
      await api(tab === 'direct' ? '/api/threads/direct' : '/api/threads/group', { method: 'POST', body: JSON.stringify({ body: optimisticBody }) });
      if (tab === 'direct') await loadDirect(); else await loadGroup();
    } catch (err) {
      setInput(body);
      toast(err instanceof ApiError ? err.message : 'Message failed to send.', 'error');
    } finally { setBusy(false); }
  }

  const current = tab === 'direct' ? direct : group;
  const messages = tab === 'direct' ? (direct?.messages ?? []) : (group?.messages ?? []);

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-bold tracking-tight">Messages</h1>
      <p className="mt-1 mb-5 text-sm text-ink-soft dark:text-white/60">Talk directly with Huzaifa, or open a discussion with everyone on the platform.</p>

      <div className="glass mb-4 flex rounded-full p-1" role="tablist" aria-label="Message tabs">
        {([['direct', 'Support · Huzaifa'], ['group', 'Community']] as const).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition-colors ${tab === key ? 'bg-leaf-deep text-cream shadow' : 'text-body-soft hover:bg-leaf/8'}`}
            onClick={() => setTab(key)}
          >
            {key === 'direct' && direct?.owner && (
              <span className={`mr-2 inline-block h-2 w-2 rounded-full align-middle ${direct.owner.online ? 'bg-green-500' : 'bg-neutral-400'}`} aria-label={direct.owner.online ? 'online' : 'offline'} />
            )}
            {label}
            {key === 'group' && group && (
              <span className="ml-2 text-xs opacity-70">· {group.online.length} online</span>
            )}
          </button>
        ))}
      </div>

      {chatMinimized ? (
        <button
          type="button"
          onClick={() => setChatMinimized(false)}
          className="fixed bottom-24 left-4 z-[60] flex h-14 items-center gap-2.5 rounded-full border border-leaf/40 bg-leaf-deep px-5 text-sm font-semibold text-cream shadow-xl md:hidden"
          aria-label="Open community chat"
        >
          <span aria-hidden>💬</span>
          {tab === 'group' ? 'Community chat' : 'Chat with Huzaifa'}
          {tab === 'group' && group && group.online.length > 0 && (
            <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-cream/20 px-1.5 text-xs">{group.online.length}</span>
          )}
        </button>
      ) : (
      <div className="glass card flex h-[62vh] min-h-[420px] flex-col overflow-hidden p-0">
        <div className="flex items-center gap-1 border-b border-black/5 px-1.5 py-1.5 md:hidden dark:border-white/10">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg text-body-soft transition-colors hover:bg-forest/8 dark:hover:bg-white/10"
            aria-label="Back — close messages"
          >←</button>
          <p className="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wide text-ink-soft dark:text-white/50">{tab === 'direct' ? 'Support · Huzaifa' : 'Community'}</p>
          <button
            type="button"
            onClick={() => setChatMinimized(true)}
            className="flex h-11 w-11 items-center justify-center rounded-full text-base text-body-soft transition-colors hover:bg-forest/8 dark:hover:bg-white/10"
            aria-label="Minimize chat"
          >✕</button>
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
          {!current && <div className="skeleton h-32 mt-4" />}
          {current && messages.length === 0 && (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-ink-soft dark:text-white/55">
              {tab === 'direct'
                ? 'No messages yet — say hello! Huzaifa reads every message and replies right here.'
                : 'No community messages yet — start the first open discussion.'}
            </div>
          )}
          {messages.map((m) => {
            const isMine = m.senderId === current?.me;
            const directMsg = m as DirectMessage;
            const groupMsg = m as GroupMessageRow;
            const senderName = tab === 'direct'
              ? (isMine ? 'You' : direct?.owner?.name ?? 'Huzaifa')
              : (groupMsg.sender.name?.trim() || 'Member');
            const isOwner = tab === 'group' && groupMsg.sender.role === 'ADMIN';
            const avatar = tab === 'group' && !isMine ? groupMsg.sender.avatarUrl : null;
            return (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15 }}
                className={`flex ${isMine ? 'justify-end' : 'justify-start'} items-end gap-2`}
              >
                {avatar && <AvatarChip url={avatar} name={senderName} />}
                <div className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${isMine
                  ? 'rounded-br-md bg-leaf-deep text-cream'
                  : isOwner
                    ? 'rounded-bl-md border border-amber/40 bg-amber/10'
                    : 'rounded-bl-md border border-forest/10 bg-cream/70 dark:border-white/10 dark:bg-white/5'}`}>
                  {!isMine && (
                    <p className={`mb-0.5 text-xs font-semibold ${isOwner ? 'text-amber dark:text-amber' : 'text-leaf-deep dark:text-leaf'}`}>
                      {isOwner ? '👤 Huzaifa (Owner)' : senderName}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <p className={`mt-1 text-right text-[10px] ${isMine ? 'text-cream/60' : 'text-ink-soft/70 dark:text-white/40'}`}>{fmtTime(m.createdAt)}</p>
                </div>
              </motion.div>
            );
          })}
          <div ref={bottomRef} />
        </div>
        <form className="flex gap-2 border-t border-black/5 p-3 sm:p-4 dark:border-white/10" onSubmit={(e) => { e.preventDefault(); void send(); }}>
          <input
            className="input flex-1 min-w-0"
            placeholder={tab === 'direct' ? 'Message Huzaifa — tokens, support, anything…' : 'Share something with the community…'}
            value={input}
            maxLength={2000}
            onChange={(e) => setInput(e.target.value)}
            aria-label="Message"
          />
          <button className="btn-leaf shrink-0 px-5 py-2.5 text-sm" disabled={busy || !input.trim()}>{busy ? '…' : 'Send'}</button>
        </form>
      </div>
      )}

      {tab === 'group' && group && group.online.length > 0 && (
        <div className="glass mt-4 card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft dark:text-white/55">Online now · {group.online.length}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {group.online.map((u) => (
              <span key={u.id} className="flex items-center gap-1.5 rounded-full border border-forest/10 bg-cream/60 px-3 py-1 text-xs dark:border-white/10 dark:bg-white/5">
                <span className="h-2 w-2 rounded-full bg-green-500" aria-label="online" />
                {u.name?.trim() || 'Member'}{u.role === 'ADMIN' ? ' · Owner' : ''}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AvatarChip({ url, name }: { url: string | null; name: string }) {
  return url
    ? <img src={url} alt="" className="h-7 w-7 rounded-full object-cover ring-1 ring-leaf/40" />
    : <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sage/40 text-[10px] font-bold text-forest dark:bg-white/10 dark:text-sage">{initials(name, 'M')}</span>;
}
