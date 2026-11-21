'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api, streamChat, ApiError } from '@/lib/client';
import { GlassCard } from '@/components/ui/glass';
import { useToast } from '@/components/toast';
import { Markdown } from '@/components/markdown';

import type { StreamContentPart } from '@/lib/client';

type Model = { id: string; slug: string; displayName: string; provider: string; tierRequired: string; contextWindow: number; maxOutputTokens: number };
type Conversation = { id: string; title: string | null; updatedAt: string };
type Msg = { role: 'user' | 'assistant' | 'system'; content: string; files?: string[] };
type Attachment =
  | { id: string; kind: 'text'; name: string; data: string; truncated: boolean }
  | { id: string; kind: 'image'; name: string; data: string };

const TEXT_MIME = /^(text\/|application\/(json|xml|javascript|x-yaml|x-sh|sql))/;
const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|ya?ml|toml|ini|cfg|conf|env|log|xml|html?|htm|css|scss|less|js|jsx|mjs|cjs|ts|tsx|py|java|kt|c|h|cpp|hpp|cs|go|rs|rb|php|sh|bash|bat|ps1|sql|gitignore|svg)$/i;
const IMAGE_MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MAX_TEXT_FILES = 10;
const MAX_IMAGES = 4;
const MAX_TEXT_CHARS = 150_000;
const MAX_IMAGE_BYTES = 3.5 * 1024 * 1024;
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
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkBusy, setLinkBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
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

  function readAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
      reader.readAsDataURL(file);
    });
  }

  const addAttachment = useCallback((a: Attachment) => {
    setAttachments((prev) => {
      if (prev.length >= MAX_TEXT_FILES + MAX_IMAGES) {
        toast(`Max ${MAX_TEXT_FILES + MAX_IMAGES} attachments per message.`, 'error');
        return prev;
      }
      return [...prev, a];
    });
  }, [toast]);

  async function addFiles(files: FileList | File[]) {
    const list = Array.from(files);
    let textCount = 0;
    let imageCount = 0;
    for (const f of list) {
      const isImage = IMAGE_MIME.includes(f.type);
      const isText = TEXT_MIME.test(f.type) || TEXT_EXT.test(f.name);
      if (!isImage && !isText) {
        toast(`${f.name}: file type not supported. Use text/code files or PNG/JPEG/WebP/GIF images.`, 'error');
        continue;
      }
      if (isImage) {
        if (imageCount + attachments.filter((a) => a.kind === 'image').length >= MAX_IMAGES) {
          toast(`Max ${MAX_IMAGES} images per message.`, 'error');
          break;
        }
        if (f.size > MAX_IMAGE_BYTES) {
          toast(`${f.name}: image exceeds ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024 * 10) / 10} MB.`, 'error');
          continue;
        }
        try {
          const dataUrl = await readAsDataUrl(f);
          addAttachment({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, kind: 'image', name: f.name, data: dataUrl });
          imageCount++;
        } catch {
          toast(`Could not read ${f.name}`, 'error');
        }
      } else {
        if (textCount + attachments.filter((a) => a.kind === 'text').length >= MAX_TEXT_FILES) {
          toast(`Max ${MAX_TEXT_FILES} text/file attachments per message.`, 'error');
          break;
        }
        if (f.size > 2 * 1024 * 1024) {
          toast(`${f.name}: file too large (max 2 MB of text).`, 'error');
          continue;
        }
        const raw = await f.text();
        if (!raw.trim()) {
          toast(`${f.name}: file is empty.`, 'error');
          continue;
        }
        addAttachment({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          kind: 'text',
          name: f.name,
          data: raw.slice(0, MAX_TEXT_CHARS),
          truncated: raw.length > MAX_TEXT_CHARS,
        });
        textCount++;
      }
    }
  }

  async function addLink() {
    const url = linkUrl.trim();
    if (!url) return;
    setLinkBusy(true);
    try {
      const d = await api<{ url: string; title: string; text: string; truncated: boolean }>('/api/tools/browse', { method: 'POST', body: JSON.stringify({ url }) });
      addAttachment({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, kind: 'text', name: d.title || d.url, data: `Read from the web: ${d.url}\n\n${d.text}`, truncated: d.truncated });
      setLinkOpen(false);
      setLinkUrl('');
      toast(`Added page: ${d.title || d.url}`, 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not read that page', 'error');
    } finally {
      setLinkBusy(false);
    }
  }

  function buildContentParts(): StreamContentPart[] {
    let text = input.trim();
    for (const a of attachments.filter((x): x is Extract<Attachment, { kind: 'text' }> => x.kind === 'text')) {
      text += `\n\n--- Attached file: ${a.name}${a.truncated ? ' (truncated)' : ''} ---\n${a.data}\n--- End of ${a.name} ---`;
    }
    if (text.length > 120_000) text = text.slice(0, 120_000);
    const parts: StreamContentPart[] = [{ type: 'text', text: text || '[files only]' }];
    for (const a of attachments.filter((x) => x.kind === 'image')) {
      parts.push({ type: 'image_url', image_url: { url: a.data } });
    }
    return parts;
  }

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    if (streaming || (!input.trim() && attachments.length === 0) || !modelSlug) return;
    const contentParts = buildContentParts();
    const fileNames = attachments.map((a) => (a.kind === 'image' ? `🖼 ${a.name}` : `📄 ${a.name}`));
    const userMsg: Msg = { role: 'user', content: input.trim() || `[${attachments.length} attachment${attachments.length > 1 ? 's' : ''}]`, files: attachments.length ? fileNames : undefined };
    const history = [...messagesRef.current, userMsg];
    const payload = history.map((m, i) =>
      i === history.length - 1 && m.role === 'user' ? { role: m.role, content: contentParts } : { role: m.role, content: m.content },
    );
    setMessages(history);
    setInput('');
    setAttachments([]);
    setStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;
    let assistantText = '';
    try {
      await streamChat(
        { model: modelSlug, messages: payload.filter((m) => m.role !== 'system'), conversationId },
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
      <aside className={`glass-panel absolute inset-y-0 left-0 z-40 w-72 !rounded-none border-x-0 border-b-0 transform pt-20 transition-transform duration-200 ease-out md:static md:translate-x-0 md:pt-16 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="flex h-full flex-col p-4 -mt-10 md:mt-0">
          <button
            className="btn-leaf mb-4 py-2 text-sm"
            onClick={() => { if (!streaming) { setConversationId(null); setMessages([]); setSidebarOpen(false); } }}
          >
            ＋ New chat
          </button>
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
            {conversations.length === 0 && (
              <p className="px-2 text-xs text-body-soft">No conversations yet.</p>
            )}
            {conversations.map((c) => (
              <div key={c.id} className={`group flex items-center justify-between rounded-lg px-2 py-1.5 text-sm transition-colors ${conversationId === c.id ? 'bg-leaf/12 text-leaf-deep dark:text-leaf-glow' : 'hover:bg-forest/6 dark:hover:bg-leaf/8'}`}>
                <button className="min-w-0 flex-1 truncate text-left" onClick={() => openConversation(c.id)} title={c.title ?? ''}>
                  {c.title || 'Untitled'}
                </button>
                <button className="ml-1 hidden text-xs text-red-500 group-hover:block" onClick={() => removeConversation(c.id)} aria-label="Delete conversation">✕</button>
              </div>
            ))}
          </div>
          {usage && (
            <div className="glass-soft mt-4 rounded-2xl p-3 text-xs">
              <div className="flex items-center justify-between font-medium">
                <span>{usage.plan?.name ?? '—'} plan</span>
                <span className="token-pill">◦ {usage.available.toLocaleString()} tokens</span>
              </div>
              {usage.plan && usage.plan.dailyTokens > 0 && (
                <>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-forest/10 dark:bg-white/10">
                    <div className="h-full rounded-full bg-gradient-to-r from-leaf-deep to-leaf-glow transition-all duration-500" style={{ width: `${dailyPct}%` }} />
                  </div>
                  <p className="text-body-soft mt-1">{usage.todayTokens.toLocaleString()} / {usage.plan.dailyTokens.toLocaleString()} today</p>
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
              <GlassCard className="mt-10 p-10 text-center">
                <div className="mb-3 text-3xl" aria-hidden>🌱</div>
                <h2 className="font-display text-lg font-bold">Start a conversation</h2>
                <p className="text-body-soft mx-auto mt-2 max-w-md text-sm">
                  Runs on the built-in mock provider. Ask anything — responses, metering and billing all work exactly like a real provider.
                </p>
              </GlassCard>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`mb-5 flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`bubble ${m.role === 'user' ? 'bubble-user bg-leaf/14 dark:bg-leaf/16' : `glass bubble-assistant ${streaming && i === messages.length - 1 ? 'stream-caret' : ''}`}`}>
                  {m.role === 'user' ? (
                    <>
                      {m.files && m.files.length > 0 && (
                        <div className="mb-2 flex flex-wrap gap-1.5">
                          {m.files.map((f, fi) => (
                            <span key={fi} className="rounded-full border border-leaf/30 bg-leaf/10 px-2 py-0.5 text-xs font-medium">{f}</span>
                          ))}
                        </div>
                      )}
                      <p className="whitespace-pre-wrap text-[0.95rem] leading-relaxed">{m.content}</p>
                    </>
                  ) : <Markdown content={m.content} />}
                </div>
              </div>
            ))}
            {streaming && lastIsUser && (
              <div className="mb-5 flex justify-start">
                <div className="glass bubble-assistant bubble px-4 py-3">
                  <div className="typing-indicator" role="status" aria-label="Assistant is typing">
                    <span /><span /><span />
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        <form onSubmit={send} className="border-t border-black/5 p-4 dark:border-white/10">
          <div className="mx-auto max-w-3xl">
            {attachments.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {attachments.map((a) => (
                  <span key={a.id} className="glass-soft inline-flex max-w-[240px] items-center gap-2 rounded-full px-3 py-1 text-xs">
                    <span aria-hidden>{a.kind === 'image' ? '🖼' : '📄'}</span>
                    <span className="truncate" title={a.name}>{a.name}</span>
                    <button type="button" aria-label={`Remove ${a.name}`} className="ml-0.5 text-red-500 hover:text-red-400" onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))}>✕</button>
                  </span>
                ))}
              </div>
            )}
            {linkOpen && (
              <div className="mb-2 flex gap-2">
                <input
                  className="input flex-1 py-2 text-sm"
                  placeholder="https://example.com/page-to-read"
                  value={linkUrl}
                  autoFocus
                  onChange={(e) => setLinkUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void addLink(); } if (e.key === 'Escape') setLinkOpen(false); }}
                  aria-label="Page URL to read"
                />
                <button type="button" className="btn-leaf px-4 py-2 text-sm" disabled={linkBusy || !linkUrl.trim()} onClick={() => void addLink()}>
                  {linkBusy ? 'Reading…' : 'Add page'}
                </button>
                <button type="button" className="btn-ghost px-3 py-2 text-sm" onClick={() => setLinkOpen(false)}>Cancel</button>
              </div>
            )}
            <div className="flex items-end gap-2">
              <div className="flex items-center gap-1 pb-1">
                <input ref={fileInputRef} type="file" multiple hidden onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = ''; }} aria-label="Attach files" />
                <input ref={folderInputRef} type="file" multiple hidden onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = ''; }} className="[&::-webkit-directory-button]:hidden" {...{ webkitdirectory: '', directory: '' }} aria-label="Attach a folder" />
                <button type="button" className="btn-ghost px-2.5 py-2.5 text-base" title="Attach files (text, code, images)" aria-label="Attach files" onClick={() => fileInputRef.current?.click()} disabled={streaming}>📎</button>
                <button type="button" className="btn-ghost px-2.5 py-2.5 text-base" title="Attach a folder" aria-label="Attach a folder" onClick={() => folderInputRef.current?.click()} disabled={streaming}>📁</button>
                <button type="button" className="btn-ghost px-2.5 py-2.5 text-base" title="Read a web page" aria-label="Read a web page" onClick={() => setLinkOpen((v) => !v)} disabled={streaming}>🌐</button>
              </div>
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
              <button className="btn-primary px-5 py-2.5 text-sm" disabled={(!input.trim() && attachments.length === 0) || !modelSlug}>Send</button>
            )}
            </div>
          </div>
          <p className="mx-auto mt-2 max-w-3xl text-xs text-ink-soft dark:text-white/45">
            Free tier limits apply server-side.{' '}
            {usage?.plan?.isFree && <Link href="/billing" className="font-medium text-leaf-deep hover:underline dark:text-leaf">Upgrade →</Link>}
          </p>
        </form>
      </main>
    </div>
  );
}
