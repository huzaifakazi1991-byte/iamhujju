'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Markdown } from '@/components/markdown';

type Msg = { role: 'user' | 'assistant'; content: string };

const AVATAR = 64;
const PANEL_W = 340;
const PANEL_H = 460;
const EDGE = 8;

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max);
}

function pikaChirp() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(900, t);
    osc.frequency.exponentialRampToValueAtTime(1600, t + 0.08);
    osc.frequency.exponentialRampToValueAtTime(700, t + 0.22);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.18, t + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.3);
    setTimeout(() => void ctx.close(), 600);
  } catch {
    /* audio unavailable */
  }
}

function speak(text: string, pitch: number) {
  try {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.pitch = pitch;
    u.rate = 1.05;
    window.speechSynthesis.speak(u);
  } catch {
    /* speech unavailable */
  }
}

export function HuzaifaAssistant() {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [panelPos, setPanelPos] = useState<{ x: number; y: number } | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: 'assistant', content: "Hi! I'm **huzaifa.ai** 👋 Ask me anything about IamHujju — plans, tokens, the playground, billing or your account." },
  ]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);

  const drag = useRef({ active: false, moved: false, dx: 0, dy: 0, vx: 0, vy: 0, lastX: 0, lastY: 0, lastT: 0 });
  const raf = useRef(0);
  const vel = useRef({ x: 0, y: 0 });
  const lastTap = useRef(0);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eggStage = useRef(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const reducedMotion = useRef(false);

  useEffect(() => {
    reducedMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    setPos({ x: vw - AVATAR - 20, y: vh - AVATAR - 20 });
    fetch('/api/auth/me').then((r) => (r.ok ? r.json() : null)).then((d) => setUserName(d?.user?.name ?? d?.user?.email ?? null)).catch(() => undefined);
    return () => cancelAnimationFrame(raf.current);
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs, thinking, open]);

  const startBounce = useCallback(() => {
    if (reducedMotion.current) return;
    cancelAnimationFrame(raf.current);
    const step = () => {
      const v = vel.current;
      if (Math.abs(v.x) < 0.08 && Math.abs(v.y) < 0.08) {
        vel.current = { x: 0, y: 0 };
        return;
      }
      v.x *= 0.92;
      v.y *= 0.92;
      setPos((p) => {
        if (!p) return p;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        let x = p.x + v.x;
        let y = p.y + v.y;
        if (x < EDGE) { x = EDGE; v.x = Math.abs(v.x) * 0.55; }
        if (x > vw - AVATAR - EDGE) { x = vw - AVATAR - EDGE; v.x = -Math.abs(v.x) * 0.55; }
        if (y < EDGE) { y = EDGE; v.y = Math.abs(v.y) * 0.55; }
        if (y > vh - AVATAR - EDGE) { y = vh - AVATAR - EDGE; v.y = -Math.abs(v.y) * 0.55; }
        return { x, y };
      });
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  }, []);

  const egg = useCallback(() => {
    if (eggStage.current === 0) {
      pikaChirp();
      speak('Pika pika!', 1.7);
      eggStage.current = 1;
    } else {
      const who = userName ? userName.split(/[\s@]/)[0] : 'friend';
      speak(`${who}, IamHujju at your service!`, 1.05);
      eggStage.current = 0;
    }
  }, [userName]);

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { active: true, moved: false, dx: e.clientX - (pos?.x ?? 0), dy: e.clientY - (pos?.y ?? 0), vx: 0, vy: 0, lastX: e.clientX, lastY: e.clientY, lastT: Date.now() };
    cancelAnimationFrame(raf.current);
    vel.current = { x: 0, y: 0 };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d.active) return;
    const now = Date.now();
    const dt = Math.max(1, now - d.lastT);
    d.vx = ((e.clientX - d.lastX) / dt) * 14;
    d.vy = ((e.clientY - d.lastY) / dt) * 14;
    d.lastX = e.clientX;
    d.lastY = e.clientY;
    d.lastT = now;
    const nx = clamp(e.clientX - d.dx, EDGE, window.innerWidth - AVATAR - EDGE);
    const ny = clamp(e.clientY - d.dy, EDGE, window.innerHeight - AVATAR - EDGE);
    if (Math.abs(nx - (pos?.x ?? nx)) > 5 || Math.abs(ny - (pos?.y ?? ny)) > 5) d.moved = true;
    setPos({ x: nx, y: ny });
  };

  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d.active) return;
    d.active = false;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* pointer already released */ }
    if (d.moved) {
      vel.current = { x: Math.abs(d.vx) > 18 ? d.vx : 0, y: Math.abs(d.vy) > 18 ? d.vy : 0 };
      startBounce();
      return;
    }
    const now = Date.now();
    if (now - lastTap.current < 350) {
      if (tapTimer.current) { clearTimeout(tapTimer.current); tapTimer.current = null; }
      lastTap.current = 0;
      egg();
      return;
    }
    lastTap.current = now;
    tapTimer.current = setTimeout(() => {
      tapTimer.current = null;
      setOpen((o) => !o);
    }, 360);
  };

  useEffect(() => {
    if (!open || !pos) { setPanelPos(null); return; }
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = Math.min(PANEL_W, vw - 2 * EDGE);
    const x = clamp(pos.x + AVATAR / 2 - w / 2, EDGE, vw - w - EDGE);
    const y = pos.y > PANEL_H + 80 ? Math.max(EDGE, pos.y - PANEL_H - 12) : Math.min(vh - PANEL_H - 12, pos.y + AVATAR + 12);
    setPanelPos({ x, y });
  }, [open, pos]);

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || thinking) return;
    setInput('');
    const history = [...msgs, { role: 'user' as const, content }];
    setMsgs(history);
    setThinking(true);
    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history.slice(-10).map(({ role, content: c }) => ({ role, content: c })) }),
      });
      const data = await res.json();
      setMsgs((m) => [...m, { role: 'assistant', content: res.ok ? data.answer : (data.error ?? 'Something went wrong — please try again.') }]);
    } catch {
      setMsgs((m) => [...m, { role: 'assistant', content: 'I could not reach the server. Check your connection and try again.' }]);
    } finally {
      setThinking(false);
    }
  }

  if (!pos) {
    return (
      <button
        type="button"
        className="pointer-events-auto fixed bottom-5 right-5 cursor-grab overflow-hidden rounded-full shadow-[0_10px_36px_-6px_rgba(0,0,0,0.6)] ring-2 ring-leaf/60"
        style={{ width: AVATAR, height: AVATAR }}
        aria-label="huzaifa.ai — your support assistant"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/media/huzaifa-ai.jpg" alt="huzaifa.ai" className="h-full w-full object-cover" draggable={false} />
      </button>
    );
  }

  const suggestions = ['What do the plans include?', 'How do tokens work?', 'How do API keys work?'];
  const panelW = Math.min(PANEL_W, window.innerWidth - 2 * EDGE);
  const panelH = Math.min(PANEL_H, window.innerHeight - 2 * EDGE);

  return (
    <div className="pointer-events-none fixed inset-0 z-[70]">
      {open && panelPos && (
        <div
          className="glass card pointer-events-auto absolute flex flex-col overflow-hidden p-0 shadow-2xl"
          style={{ left: panelPos.x, top: panelPos.y, width: panelW, height: panelH }}
          role="dialog"
          aria-label="huzaifa.ai support chat"
        >
          <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/media/huzaifa-ai.jpg" alt="" className="h-9 w-9 rounded-full object-cover ring-1 ring-leaf/50" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">huzaifa.ai</p>
              <p className="truncate text-xs text-body-soft">IamHujju support · always awake</p>
            </div>
            <button className="btn-ghost rounded-full px-2.5 py-1 text-xs" onClick={() => setOpen(false)} aria-label="Close chat">✕</button>
          </div>
          <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto px-4 py-3 text-sm">
            {msgs.map((m, i) => (
              <div key={i} className={`bubble max-w-full ${m.role === 'user' ? 'bubble-user ml-8 bg-leaf/14 dark:bg-leaf/16' : 'mr-6'}`}>
                {m.role === 'user'
                  ? <p className="whitespace-pre-wrap">{m.content}</p>
                  : <Markdown content={m.content} />}
              </div>
            ))}
            {thinking && (
              <div className="bubble bubble-assistant mr-6 flex items-center gap-1.5 py-3">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-leaf/70" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-leaf/70 [animation-delay:120ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-leaf/70 [animation-delay:240ms]" />
              </div>
            )}
          </div>
          {msgs.length <= 1 && (
            <div className="flex flex-wrap gap-1.5 px-4 pb-2">
              {suggestions.map((s) => (
                <button key={s} className="pill" onClick={() => void send(s)}>{s}</button>
              ))}
            </div>
          )}
          <form
            className="flex items-center gap-2 border-t border-white/10 px-3 py-2.5"
            onSubmit={(e) => { e.preventDefault(); void send(); }}
          >
            <input
              className="input min-w-0 flex-1 py-2 text-sm"
              placeholder="Ask huzaifa.ai anything…"
              value={input}
              maxLength={2000}
              onChange={(e) => setInput(e.target.value)}
            />
            <button type="submit" className="btn-primary shrink-0 px-4 py-2 text-sm" disabled={thinking || !input.trim()}>Send</button>
          </form>
        </div>
      )}
      <button
        type="button"
        className="pointer-events-auto fixed cursor-grab touch-none select-none overflow-hidden rounded-full shadow-[0_10px_36px_-6px_rgba(0,0,0,0.6)] ring-2 ring-leaf/60 transition-transform duration-150 ease-out hover:scale-105 active:scale-95 active:cursor-grabbing"
        style={{ left: pos.x, top: pos.y, width: AVATAR, height: AVATAR }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        aria-label="huzaifa.ai — your support assistant. Drag me anywhere, tap to chat, double-tap for a surprise."
        title="huzaifa.ai — tap to open · double-tap for a surprise · drag me anywhere"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/media/huzaifa-ai.jpg" alt="huzaifa.ai" className="h-full w-full object-cover" draggable={false} />
        {!open && <span className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 animate-pulse rounded-full border-2 border-forest bg-leaf" aria-hidden />}
      </button>
    </div>
  );
}
