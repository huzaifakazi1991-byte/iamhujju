'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api, streamChat, ApiError } from '@/lib/client';
import { useToast } from '@/components/toast';
import { Markdown } from '@/components/markdown';

type Model = { id: string; slug: string; displayName: string; provider: string; tierRequired: string; contextWindow: number; maxOutputTokens: number };
type Conversation = { id: string; title: string | null; updatedAt: string };
type Msg = { role: 'user' | 'assistant' | 'system'; content: string };
type Usage = {
  available: number;
  todayTokens: number;
  plan: { slug: string; name: string; dailyTokens: number; isFree: boolean } | null;
};

export function ChatClient() {
  const { toast } = useToast();
  const [models, setModels] = useState<Model[]>([]);
  const [modelSlug, setModelSlug] = useState<string>('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [usage, setUsage] = useState<Usage | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<Msg[]>([]);
  messagesRef.current = messages;

  const refreshUsage = useCallback(() => {
    api<Usage>('/api/usage').then(setUsage).catch(() => undefined);
  }, []);

  useEffect(() => {
    api<{ models: Model[] }>('/api/models')
      .then((d) => {
        setModels(d.models);
        if (d.models.length > 0) {
          const firstFree = d.models.find((m) => m.tierRequired === 'free') ?? d.models[0];
          setModelSlug((current) => current || firstFree.slug);
        }
      })
      .catch((err) => toast(err instanceof ApiError ? err.message : 'Could not load models', 'error'));
    api<{ conversations: Conversation[] }>('/api/conversations')
      .then((d) => setConversations(d.conversations))
      .catch(() => undefined);
    refreshUsage();
  }, [toast, refreshUsage]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming]);

  async function openConversation(id: string) {
    setSidebarOpen(false);
    if (streaming) return;
    try {
      const d = await api<{ conversation: { id: string; messages: { role: string; content: string }[] } }>(`/api/conversations/${id}`);
      setConversationId(id);
      setMessages(d.conversation.messages.map((m) => ({ role: m.role as Msg['role'], content: m.content })));
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not load conversation', 'error');
    }
  }

  async function removeConversation(id: string) {
    await api(`/api/conversations/${id}`, { method: 'DELETE' }).catch(() => undefined);
    setConversations((c) => c.filter((x) => x.id !== id));
    if (conversationId === id) { setConversationId(null); setMessages([]); }
  }

  function stop() {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
  }

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    if (streaming || !input.trim() || !modelSlug) return;
    const userMsg: Msg = { role: 'user', content: input.trim() };
    const history = [...messagesRef.current, userMsg];
    setMessages(history);
    setInput('');
    setStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;
    let assistantText = '';
    try {
      await streamChat(
        { model: modelSlug, messages: history.filter((m) => m.role !== 'system'), conversationId },
        (ev) => {
          const type = ev.type as string;
          if (type === 'meta' && typeof ev.conversationId === 'string') {
            setConversationId(ev.conversationId);
            setConversations((c) =>
              c.some((x) => x.id === ev.conversationId)
                ? c
                : [{ id: ev.conversationId as string, title: userMsg.content.slice(0, 60), updatedAt: new Date().toISOString() }, ...c],
            );
          } else if (type === 'delta' && typeof ev.text === 'string') {
            assistantText += ev.text;
            setMessages([...history, { role: 'assistant', content: assistantText }]);
          } else if (type === 'done') {
            refreshUsage();
          } else if (type === 'error') {
            toast(String(ev.message ?? 'Provider error'), 'error');
          }
        },
        controller.signal,
      );
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        toast(err instanceof Error ? err.message : 'Chat failed', 'error');
        setMessages(history);
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
      refreshUsage();
    }
  }

  const currentModel = models.find((m) => m.slug === modelSlug);
  const lastIsUser = messages.length === 0 || messages[messages.length - 1].role === 'user';
  const dailyPct = usage?.plan && usage.plan.dailyTokens > 0 ? Math.min(100, Math.round((usage.todayTokens / usage.plan.dailyTokens) * 100)) : 0;

  return (
    <div className="flex min-h-0 flex-1">
      <aside className={`absolute inset-y-0 left-0 z-40 w-72 transform border-r border-black/5 bg-cream pt-20 transition-transform dark:border-white/10 dark:bg-night md:static md:translate-x-0 md:pt-16 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="flex h-full flex-col p-4">
          <button
            className="btn-primary mb-4 py-2 text-sm"
            onClick={() => { if (!streaming) { setConversationId(null); setMessages([]); setSidebarOpen(false); } }}
          >
            ＋ New chat
          </button>
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
            {conversations.length === 0 && (
              <p className="px-2 text-xs text-ink-soft dark:text-white/50">No conversations yet.</p>
            )}
            {conversations.map((c) => (
              <div key={c.id} className={`group flex items-center justify-between rounded-lg px-2 py-1.5 text-sm ${conversationId === c.id ? 'bg-agent/10' : 'hover:bg-black/5 dark:hover:bg-white/5'}`}>
                <button className="min-w-0 flex-1 truncate text-left" onClick={() => openConversation(c.id)} title={c.title ?? ''}>
                  {c.title || 'Untitled'}
                </button>
                <button className="ml-1 hidden text-xs text-red-500 group-hover:block" onClick={() => removeConversation(c.id)} aria-label="Delete conversation">✕</button>
              </div>
            ))}
          </div>
          {usage && (
            <div className="mt-4 rounded-xl bg-agent/5 p-3 text-xs dark:bg-white/5">
              <div className="flex justify-between font-medium">
                <span>{usage.plan?.name ?? '—'} plan</span>
                <span>{usage.available.toLocaleString()} tokens</span>
              </div>
              {usage.plan && usage.plan.dailyTokens > 0 && (
                <>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                    <div className="h-full rounded-full bg-agent transition-all" style={{ width: `${dailyPct}%` }} />
                  </div>
                  <p className="mt-1 text-ink-soft dark:text-white/50">{usage.todayTokens.toLocaleString()} / {usage.plan.dailyTokens.toLocaleString()} today</p>
                </>
              )}
            </div>
          )}
        </div>
      </aside>

      <main className="flex min-h-0 w-full flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-black/5 px-4 py-2.5 dark:border-white/10">
          <div className="flex items-center gap-2">
            <button className="btn-ghost px-3 py-1.5 text-sm md:hidden" onClick={() => setSidebarOpen(!sidebarOpen)}>☰</button>
            <select
              className="input w-auto py-1.5 text-sm"
              value={modelSlug}
              onChange={(e) => setModelSlug(e.target.value)}
              aria-label="Select model"
            >
              {models.length === 0 && <option value="">No models available</option>}
              {models.map((m) => (
                <option key={m.slug} value={m.slug}>
                  {m.displayName} · {m.provider}
                  {m.tierRequired !== 'free' ? ` · ${m.tierRequired}+` : ''}
                </option>
              ))}
            </select>
          </div>
          {currentModel && (
            <span className="hidden text-xs text-ink-soft sm:block dark:text-white/50">
              ctx {Math.round(currentModel.contextWindow / 1024)}K · max out {currentModel.maxOutputTokens}
            </span>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
          <div className="mx-auto max-w-3xl">
            {messages.length === 0 && !streaming && (
              <div className="card mt-10 p-10 text-center">
                <div className="mb-3 text-3xl">💬</div>
                <h2 className="text-lg font-bold">Start a conversation</h2>
                <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft dark:text-white/60">
                  Runs on the built-in mock provider. Ask anything — responses, metering and billing all work exactly like a real provider.
                </p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`mb-5 flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${m.role === 'user' ? 'bg-agent text-white' : 'card'}`}>
                  {m.role === 'user' ? <p className="whitespace-pre-wrap text-[0.95rem]">{m.content}</p> : <Markdown content={m.content} />}
                </div>
              </div>
            ))}
            {streaming && lastIsUser && (
              <div className="mb-5 flex justify-start">
                <div className="card px-4 py-3">
                  <div className="flex gap-1.5">
                    <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-agent [animation-delay:0ms]" />
                    <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-agent [animation-delay:120ms]" />
                    <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-agent [animation-delay:240ms]" />
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        <form onSubmit={send} className="border-t border-black/5 p-4 dark:border-white/10">
          <div className="mx-auto flex max-w-3xl items-end gap-2">
            <textarea
              className="input max-h-40 min-h-[46px] flex-1 resize-y"
              placeholder={modelSlug ? 'Ask anything… (Enter to send, Shift+Enter for a new line)' : 'Loading models…'}
              value={input}
              rows={1}
              disabled={streaming || models.length === 0}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
              }}
            />
            {streaming ? (
              <button type="button" className="btn-ghost px-5 py-2.5 text-sm" onClick={stop}>Stop</button>
            ) : (
              <button className="btn-primary px-5 py-2.5 text-sm" disabled={!input.trim() || !modelSlug}>Send</button>
            )}
          </div>
          <p className="mx-auto mt-2 max-w-3xl text-xs text-ink-soft dark:text-white/45">
            Free tier limits apply server-side.{' '}
            {usage?.plan?.isFree && <Link href="/billing" className="font-medium text-agent-deep hover:underline dark:text-agent">Upgrade →</Link>}
          </p>
        </form>
      </main>
    </div>
  );
}
