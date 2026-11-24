'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api, streamChat, streamImage, ApiError } from '@/lib/client';
import { GlassCard } from '@/components/ui/glass';
import { useToast } from '@/components/toast';
import { Markdown } from '@/components/markdown';
import { findGalleryTemplate } from '@/lib/gallery';

import type { StreamContentPart } from '@/lib/client';

function ModePrefill({ onApply }: { onApply: (mode: string) => void }) {
  const params = useSearchParams();
  const applied = useRef<string | null>(null);
  useEffect(() => {
    const requested = params.get('mode');
    if (!requested || applied.current === requested) return;
    if (requested !== 'image' && requested !== 'video') return;
    applied.current = requested;
    onApply(requested);
  }, [params, onApply]);
  return null;
}

function TemplatePrefill({ onApply }: { onApply: (prompt: string, title: string) => void }) {
  const params = useSearchParams();
  const appliedSlug = useRef<string | null>(null);
  useEffect(() => {
    const slug = params.get('template');
    if (!slug || appliedSlug.current === slug) return;
    const hit = findGalleryTemplate(slug);
    if (!hit) return;
    appliedSlug.current = slug;
    onApply(hit.prompt, hit.title);
  }, [params, onApply]);
  return null;
}

function IconCopy() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}
function IconEdit() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}
function IconUndo() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 7v6h6" />
      <path d="M21 17a9 9 0 0 0-15-6.7L3 13" />
    </svg>
  );
}

type Model = { id: string; slug: string; displayName: string; provider: string; capability: string; tierRequired: string; contextWindow: number; maxOutputTokens: number };
type Conversation = { id: string; title: string | null; updatedAt: string };
type Msg = { role: 'user' | 'assistant' | 'system'; content: string; files?: string[]; imageUrl?: string; note?: string };
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
  const [mode, setMode] = useState<'chat' | 'image' | 'video'>('chat');
  const [upgradeMsg, setUpgradeMsg] = useState<string | null>(null);
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
  const composerRef = useRef<HTMLTextAreaElement>(null);
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
          const firstFree = d.models.find((m) => m.tierRequired === 'free' && (m.capability ?? 'chat') === 'chat') ?? d.models[0];
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

  function switchMode(next: 'chat' | 'image' | 'video') {
    if (next === mode) return;
    setMode(next);
    const pool = models.filter((m) => (next === 'chat' ? (m.capability ?? 'chat') === 'chat' : m.capability === next));
    if (pool.length > 0) setModelSlug(pool[0].slug);
  }

  function openCapability(next: 'image' | 'video') {
    if (streaming) cancelRun();
    const pool = models.filter((m) => m.capability === next);
    if (pool.length === 0) {
      openUpgrade(`No ${next} models are available for your plan yet — upgrade or buy tokens to unlock ${next} generation.`);
      return;
    }
    setMode(next);
    setModelSlug(pool[0].slug);
    composerRef.current?.focus();
  }

  function openUpgrade(msg: string) {
    setUpgradeMsg(msg);
  }

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState !== 'visible') return;
      api<{ models: Model[] }>('/api/models').then((d) => setModels(d.models)).catch(() => undefined);
      refreshUsage();
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refreshUsage]);

  useEffect(() => {
    if (!sidebarOpen && !upgradeMsg) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (upgradeMsg) setUpgradeMsg(null);
      if (sidebarOpen) setSidebarOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sidebarOpen, upgradeMsg]);

  async function openConversation(id: string) {
    setSidebarOpen(false);
    if (streaming) cancelRun();
    try {
      const d = await api<{ conversation: { id: string; messages: { role: string; content: string }[] } }>(`/api/conversations/${id}`);
      setConversationId(id);
      setMessages(d.conversation.messages.map((m) => {
        const img = /^\[\[image:(.*?)\]\]/.exec(m.content);
        if (img) {
          return { role: m.role as Msg['role'], content: m.content.slice(img[0].length).trim(), imageUrl: img[1], note: m.content.slice(img[0].length).trim() || undefined };
        }
        return { role: m.role as Msg['role'], content: m.content };
      }));
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not load conversation', 'error');
    }
  }

  async function removeConversation(id: string) {
    await api(`/api/conversations/${id}`, { method: 'DELETE' }).catch(() => undefined);
    setConversations((c) => c.filter((x) => x.id !== id));
    if (conversationId === id) { setConversationId(null); setMessages([]); }
  }

  function cancelRun() {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
  }

  async function copyMessage(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast('Copied to clipboard', 'success');
    } catch {
      toast('Could not copy — select the text manually', 'error');
    }
  }

  async function truncateFrom(index: number) {
    const keep = messagesRef.current.slice(0, index);
    setMessages(keep);
    if (!conversationId) return;
    try {
      await api(`/api/conversations/${conversationId}`, { method: 'PATCH', body: JSON.stringify({ keepCount: index }) });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not update conversation', 'error');
    }
  }

  function editMessage(index: number, content: string) {
    if (streaming) return;
    setInput(content);
    void truncateFrom(index);
    document.querySelector<HTMLTextAreaElement>('.composer-textarea')?.focus();
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
    const imageNames = attachments.filter((x) => x.kind === 'image').map((x) => x.name);
    if (imageNames.length > 0) text += `${text ? '\n\n' : ''}[Images attached: ${imageNames.join(', ')}]`;
    if (text.length > 120_000) text = text.slice(0, 120_000);
    const parts: StreamContentPart[] = [{ type: 'text', text: text || '[files only]' }];
    for (const a of attachments.filter((x) => x.kind === 'image')) {
      parts.push({ type: 'image_url', image_url: { url: a.data } });
    }
    return parts;
  }

  function handleDone(ev: Record<string, unknown>) {
    refreshUsage();
    const balance = typeof ev.balance === 'number' ? ev.balance : null;
    if (balance !== null && balance < 500 && balance >= 0) {
      toast(`⚠️ Low token balance: ${balance.toLocaleString()} left. Buy tokens or upgrade to keep going.`, 'error');
    }
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
            handleDone(ev);
          } else if (type === 'notice') {
            // The gateway automatically failed over to another model.
            toast(String(ev.message ?? 'Switched model'), 'info');
            if (typeof ev.to === 'string') setModelSlug(ev.to);
          } else if (type === 'error') {
            toast(String(ev.message ?? 'Provider error'), 'error');
          }
        },
        controller.signal,
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        openUpgrade(err.message);
        setMessages(history);
      } else if (!(err instanceof DOMException && err.name === 'AbortError')) {
        toast(err instanceof Error ? err.message : 'Chat failed', 'error');
        setMessages(history);
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
      refreshUsage();
    }
  }

  async function sendImage(e?: React.FormEvent) {
    e?.preventDefault();
    if (streaming || !input.trim() || !modelSlug) return;
    const prompt = input.trim();
    const userMsg: Msg = { role: 'user', content: prompt };
    const history = [...messagesRef.current, userMsg];
    setMessages(history);
    setInput('');
    setStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await streamImage(
        { model: modelSlug, prompt, conversationId },
        (ev) => {
          const type = ev.type as string;
          if (type === 'meta' && typeof ev.conversationId === 'string') {
            setConversationId(ev.conversationId);
            setConversations((c) =>
              c.some((x) => x.id === ev.conversationId)
                ? c
                : [{ id: ev.conversationId as string, title: prompt.slice(0, 60), updatedAt: new Date().toISOString() }, ...c],
            );
          } else if (type === 'image' && typeof ev.url === 'string') {
            setMessages([...history, { role: 'assistant', content: String(ev.note ?? ''), imageUrl: ev.url, note: ev.note ? String(ev.note) : undefined }]);
          } else if (type === 'done') {
            handleDone(ev);
            if (ev.status === 'error' && typeof ev.error === 'string') toast(ev.error, 'error');
          } else if (type === 'error') {
            toast(String(ev.message ?? 'Render failed'), 'error');
          }
        },
        controller.signal,
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        openUpgrade(err.message);
        setMessages(history);
      } else if (!(err instanceof DOMException && err.name === 'AbortError')) {
        toast(err instanceof Error ? err.message : 'Render failed', 'error');
        setMessages(history);
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
      refreshUsage();
    }
  }

  const currentModel = models.find((m) => m.slug === modelSlug);
  const modeModels = models.filter((m) => (mode === 'chat' ? (m.capability ?? 'chat') === 'chat' : m.capability === mode));
  const groupedModeModels = useMemo(() => {
    const groups = new Map<string, Model[]>();
    for (const m of modeModels) {
      const list = groups.get(m.provider) ?? [];
      list.push(m);
      groups.set(m.provider, list);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [modeModels]);
  const lastIsUser = messages.length === 0 || messages[messages.length - 1].role === 'user';
  const dailyPct = usage?.plan && usage.plan.dailyTokens > 0 ? Math.min(100, Math.round((usage.todayTokens / usage.plan.dailyTokens) * 100)) : 0;

  return (
    <div className="flex min-h-0 flex-1">
      {sidebarOpen && (
        <button
          type="button"
          className="fixed inset-0 z-[39] bg-forest/40 backdrop-blur-sm md:hidden"
          onPointerDown={() => setSidebarOpen(false)}
          aria-label="Close conversation menu"
          style={{ transition: 'opacity 150ms' }}
        />
      )}
      <Suspense fallback={null}>
        <TemplatePrefill
          onApply={(prompt, title) => {
            setInput(prompt);
            toast(`🎨 Template loaded — ${title}. Attach your photo with 📎 and send — no prompt needed.`, 'success');
          }}
        />
      </Suspense>
      <Suspense fallback={null}>
        <ModePrefill onApply={(cap) => openCapability(cap as 'image' | 'video')} />
      </Suspense>
      <aside className={`glass-panel absolute inset-y-0 left-0 z-40 w-72 !rounded-none border-x-0 border-b-0 transform pt-20 transition-transform duration-[250ms] ease-[cubic-bezier(0.22,1,0.36,1)] md:static md:translate-x-0 md:pt-16 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="flex h-full flex-col p-4 -mt-10 md:mt-0">
          <button
            className="btn-leaf mb-4 py-2 text-sm"
            onClick={() => { if (streaming) cancelRun(); setConversationId(null); setMessages([]); setSidebarOpen(false); }}
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
        <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-black/5 px-3 py-2.5 sm:px-4 dark:border-white/10">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2">
            <button className="btn-ghost shrink-0 px-2.5 py-1.5 text-sm md:hidden" onClick={() => setSidebarOpen(!sidebarOpen)} aria-expanded={sidebarOpen} aria-label="Conversations menu">☰</button>
            <div className="flex overflow-hidden rounded-lg border border-black/8 text-xs dark:border-white/10">
              {([['chat', '💬'], ['image', '🖼'], ['video', '🎬']] as const).map(([key, icon]) => (
                <button
                  key={key}
                  type="button"
                  className={`px-3 py-1.5 transition-colors ${mode === key ? 'bg-leaf/16 font-semibold text-leaf-deep dark:text-leaf-glow' : 'text-ink-soft hover:bg-forest/6 dark:text-white/50 dark:hover:bg-leaf/8'} ${models.some((m) => m.capability === key) ? '' : 'opacity-40'}`}
                  onClick={() => { if (streaming) cancelRun(); switchMode(key); }}
                  title={key === 'chat' ? 'Chat models' : key === 'image' ? 'Image generation models' : 'Video generation models'}
                >{icon} {key}</button>
              ))}
            </div>
            <button
              type="button"
              className="btn-leaf px-2.5 py-1.5 text-xs sm:px-3"
              onClick={() => openCapability('image')}
              title="Jump straight to image generation — just type a prompt"
            ><span className="sm:hidden">🖼</span><span className="hidden sm:inline">🖼 Create image</span></button>
            <button
              type="button"
              className="btn-leaf px-2.5 py-1.5 text-xs sm:px-3"
              onClick={() => openCapability('video')}
              title="Jump straight to video generation — just type a prompt"
            ><span className="sm:hidden">🎬</span><span className="hidden sm:inline">🎬 Create video</span></button>
            <select
              className="input w-auto max-w-40 min-w-0 flex-1 py-1.5 text-sm sm:flex-none sm:max-w-64"
              value={modelSlug}
              onChange={(e) => { if (streaming) cancelRun(); setModelSlug(e.target.value); }}
              aria-label="Select model"
            >
              {modeModels.length === 0 && <option value="">No {mode} models available</option>}
              {groupedModeModels.map(([providerName, list]) => (
                <optgroup key={providerName} label={providerName}>
                  {list.map((m) => (
                    <option key={m.slug} value={m.slug}>
                      {m.displayName}
                      {m.tierRequired !== 'free' ? ` · ${m.tierRequired}+` : ''}
                    </option>
                  ))}
                </optgroup>
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
                <div className="mb-3 text-3xl" aria-hidden>{mode === 'chat' ? '🌱' : mode === 'image' ? '🖼' : '🎬'}</div>
                <h2 className="font-display text-lg font-bold">{mode === 'chat' ? 'Start a conversation' : mode === 'image' ? 'Generate an image' : 'Generate a video preview'}</h2>
                <p className="text-body-soft mx-auto mt-2 max-w-md text-sm">
                  {mode === 'chat'
                    ? 'Ask anything — responses, metering and billing all work exactly like a real provider.'
                    : mode === 'image'
                      ? 'Describe the image, pick an image model, and the render is metered to your token balance like every other model.'
                      : 'Describe the short clip and render a video preview with your available video models.'}
                </p>
              </GlassCard>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`mb-5 flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
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
                  ) : m.imageUrl ? (
                    <div className="space-y-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={m.imageUrl} alt={m.note || 'Generated image'} className="max-w-md rounded-2xl border border-black/8 shadow-lg dark:border-white/10" loading="lazy" />
                      {m.note && <p className="text-body-soft text-xs">{m.note}</p>}
                    </div>
                  ) : <Markdown content={m.content} />}
                </div>
                {m.role === 'user' ? (
                  <div className="mt-1 flex items-center gap-0.5">
                    <button
                      type="button"
                      className="rounded-md p-1.5 opacity-55 transition-opacity hover:opacity-100 hover:text-leaf-deep dark:hover:text-leaf"
                      title="Copy"
                      aria-label="Copy message"
                      onClick={() => void copyMessage(m.content)}
                    ><IconCopy /></button>
                    <button
                      type="button"
                      className="rounded-md p-1.5 opacity-55 transition-opacity hover:opacity-100 hover:text-leaf-deep dark:hover:text-leaf disabled:opacity-25"
                      title="Edit and resend"
                      aria-label="Edit and resend message"
                      disabled={streaming}
                      onClick={() => editMessage(i, m.content)}
                    ><IconEdit /></button>
                    <button
                      type="button"
                      className="rounded-md p-1.5 opacity-55 transition-opacity hover:opacity-100 hover:text-red-500 disabled:opacity-25"
                      title="Undo — remove this message and everything after it"
                      aria-label="Undo message and replies after it"
                      disabled={streaming}
                      onClick={() => void truncateFrom(i)}
                    ><IconUndo /></button>
                  </div>
                ) : (
                  i < messages.length - 1 && (
                    <button
                      type="button"
                      className="mt-1 rounded-md p-1.5 opacity-0 transition-opacity hover:opacity-100 focus:opacity-100 hover:text-leaf-deep dark:hover:text-leaf"
                      title="Copy reply"
                      aria-label="Copy reply"
                      onClick={() => void copyMessage(m.content)}
                    ><IconCopy /></button>
                  )
                )}
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

        <form onSubmit={mode === 'chat' ? send : sendImage} className="border-t border-black/5 p-4 dark:border-white/10">
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
              ref={composerRef}
              className="composer-textarea input max-h-40 min-h-[46px] flex-1 resize-y"
              placeholder={modelSlug ? (mode === 'chat' ? 'Ask anything… (Enter to send, Shift+Enter for a new line)' : 'Describe the image to render… (Enter to generate)') : 'Loading models…'}
              value={input}
              rows={1}
              disabled={streaming || models.length === 0}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
              }}
            />
            {streaming ? (
              <button type="button" className="btn-ghost px-5 py-2.5 text-sm" onClick={cancelRun}>Stop</button>
            ) : (
              <button className="btn-primary px-5 py-2.5 text-sm" disabled={(!input.trim() && (mode === 'chat' ? attachments.length === 0 : true)) || !modelSlug}>{mode === 'chat' ? 'Send' : 'Generate'}</button>
            )}
            </div>
          </div>
          <p className="mx-auto mt-2 max-w-3xl text-xs text-ink-soft dark:text-white/45">
            {mode === 'chat' ? 'Free tier limits apply server-side.' : 'Renders cost a flat token fee per output, charged to your balance.'}{' '}
            {usage?.plan?.isFree && <Link href="/billing" className="font-medium text-leaf-deep hover:underline dark:text-leaf">Upgrade →</Link>}
          </p>
        </form>
      </main>

      {upgradeMsg && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-forest/60 p-4 backdrop-blur-sm" role="dialog" aria-modal aria-label="Upgrade required" onClick={(e) => { if (e.target === e.currentTarget) setUpgradeMsg(null); }}>
          <GlassCard className="w-full max-w-md p-8 text-center">
            <div className="mb-3 text-3xl" aria-hidden>⚡</div>
            <h2 className="font-display text-lg font-bold">Out of tokens</h2>
            <p className="text-body-soft mx-auto mt-2 max-w-sm text-sm">{upgradeMsg}</p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link href="/pricing" className="btn-leaf px-6 py-2.5 text-sm" onClick={() => setUpgradeMsg(null)}>Upgrade plan</Link>
              <Link href="/billing" className="btn-ghost px-6 py-2.5 text-sm" onClick={() => setUpgradeMsg(null)}>Buy tokens</Link>
              <button type="button" className="btn-ghost px-4 py-2.5 text-sm" onClick={() => setUpgradeMsg(null)}>Close</button>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
}

