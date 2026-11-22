'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Markdown } from '@/components/markdown';

type Msg = { role: 'user' | 'assistant'; content: string };

const AVATAR = 64;
const PANEL_W = 340;
const PANEL_H = 460;
const EDGE = 8;
const RESTITUTION = 0.85;
const FRICTION = 2.1;
const MAX_SPEED = 3400;
const FLICK_SENSITIVITY = 1.35;
const TAP_SLOP = 8;

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
  const openRef = useRef(false);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const posRef = useRef({ x: 0, y: 0 });
  const avatarRef = useRef<HTMLButtonElement | null>(null);
  const samples = useRef<Array<{ x: number; y: number; t: number }>>([]);
  const drag = useRef({ active: false, moved: false, dx: 0, dy: 0 });
  const raf = useRef(0);
  const vel = useRef({ x: 0, y: 0 });
  const lastFrame = useRef(0);
  const lastTap = useRef(0);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eggStage = useRef(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const reducedMotion = useRef(false);

  const paint = useCallback(() => {
    const el = avatarRef.current;
    if (!el) return;
    el.style.transform = `translate3d(${Math.round(posRef.current.x)}px, ${Math.round(posRef.current.y)}px, 0)`;
  }, []);

  const glideToRest = useCallback(() => {
    cancelAnimationFrame(raf.current);
    lastFrame.current = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - lastFrame.current) / 1000);
      lastFrame.current = now;
      const v = vel.current;
      const p = posRef.current;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      p.x += v.x * dt;
      p.y += v.y * dt;
      if (p.x < EDGE) { p.x = EDGE; v.x = Math.abs(v.x) * RESTITUTION; }
      if (p.x > vw - AVATAR - EDGE) { p.x = vw - AVATAR - EDGE; v.x = -Math.abs(v.x) * RESTITUTION; }
      if (p.y < EDGE) { p.y = EDGE; v.y = Math.abs(v.y) * RESTITUTION; }
      if (p.y > vh - AVATAR - EDGE) { p.y = vh - AVATAR - EDGE; v.y = -Math.abs(v.y) * RESTITUTION; }
      const drag2 = Math.exp(-FRICTION * dt);
      v.x *= drag2;
      v.y *= drag2;
      paint();
      if (Math.hypot(v.x, v.y) < 18) {
        v.x = 0;
        v.y = 0;
        setPos({ ...p });
        return;
      }
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  }, [paint]);

  useEffect(() => {
    reducedMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    posRef.current = { x: vw - AVATAR - 20, y: vh - AVATAR - 20 };
    setPos({ ...posRef.current });
    const onResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      posRef.current.x = clamp(posRef.current.x, EDGE, Math.max(EDGE, w - AVATAR - EDGE));
      posRef.current.y = clamp(posRef.current.y, EDGE, Math.max(EDGE, h - AVATAR - EDGE));
      paint();
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(raf.current);
    };
  }, [paint]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs, thinking, open]);

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
    drag.current = { active: true, moved: false, dx: e.clientX - posRef.current.x, dy: e.clientY - posRef.current.y };
    samples.current = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
    cancelAnimationFrame(raf.current);
    vel.current = { x: 0, y: 0 };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d.active) return;
    const now = performance.now();
    samples.current.push({ x: e.clientX, y: e.clientY, t: now });
    if (samples.current.length > 5) samples.current.shift();
    const nx = clamp(e.clientX - d.dx, EDGE, window.innerWidth - AVATAR - EDGE);
    const ny = clamp(e.clientY - d.dy, EDGE, window.innerHeight - AVATAR - EDGE);
    if (Math.abs(nx - posRef.current.x) > 4 || Math.abs(ny - posRef.current.y) > 4) d.moved = true;
    posRef.current = { x: nx, y: ny };
    paint();
  };

  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d.active) return;
    d.active = false;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* pointer already released */ }

    if (d.moved && samples.current.length >= 2) {
      const first = samples.current[0];
      const last = samples.current[samples.current.length - 1];
      const dt = Math.max(1, last.t - first.t) / 1000;
      let vx = ((last.x - first.x) / dt) * FLICK_SENSITIVITY;
      let vy = ((last.y - first.y) / dt) * FLICK_SENSITIVITY;
      const speed = Math.hypot(vx, vy);
      if (speed > MAX_SPEED) {
        vx = (vx / speed) * MAX_SPEED;
        vy = (vy / speed) * MAX_SPEED;
      }
      if (!reducedMotion.current) {
        vel.current = { x: vx, y: vy };
        glideToRest();
        return;
      }
      setPos({ ...posRef.current });
      return;
    }
    if (d.moved) {
      setPos({ ...posRef.current });
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
      if (openRef.current) setOpen(false);
      else openPanel();
    }, 360);
  };

  const openPanel = useCallback(() => {
    const p = posRef.current;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = Math.min(PANEL_W, vw - 2 * EDGE);
    const h = Math.min(PANEL_H, vh - 2 * EDGE);
    const x = clamp(p.x + AVATAR / 2 - w / 2, EDGE, vw - w - EDGE);
    const y = p.y > h + 80 ? Math.max(EDGE, p.y - h - 12) : Math.min(vh - h - 12, p.y + AVATAR + 12);
    setPanelPos({ x, y });
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

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
  const pop = reducedMotion.current ? undefined : { duration: 0.22, ease: [0.34, 1.45, 0.64, 1] as const };

  return (
    <div className="pointer-events-none fixed inset-0 z-[70]">
      <AnimatePresence>
        {open && (
          <motion.div
            key="assistant-backdrop"
            className="pointer-events-auto absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onPointerDown={() => setOpen(false)}
            aria-hidden
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {open && panelPos && (
          <motion.div
            key="assistant-panel"
            className="glass card pointer-events-auto absolute flex flex-col overflow-hidden p-0 shadow-2xl"
            style={{ left: panelPos.x, top: panelPos.y, width: panelW, height: Math.min(panelH, window.innerHeight - 2 * EDGE), transformOrigin: 'bottom right' }}
            initial={reducedMotion.current ? { opacity: 0 } : { opacity: 0, scale: 0.82, y: 16 }}
            animate={reducedMotion.current ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={reducedMotion.current ? { opacity: 0 } : { opacity: 0, scale: 0.88, y: 10 }}
            transition={pop}
            role="dialog"
            aria-label="huzaifa.ai support chat"
          >
            <div className="flex items-center gap-3 border-b border-white/10 px-3 py-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/media/huzaifa-ai.jpg" alt="" className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-leaf/50" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">huzaifa.ai</p>
                <p className="truncate text-xs text-body-soft">IamHujju support · always awake</p>
              </div>
              <button
                type="button"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg text-body-soft transition-colors hover:bg-forest/8 hover:text-forest dark:hover:bg-white/10 dark:hover:text-white"
                onClick={() => setOpen(false)}
                aria-label="Close chat"
              >✕</button>
            </div>
            <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto overscroll-contain px-4 py-3 text-sm">
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
          </motion.div>
        )}
      </AnimatePresence>
      <button
        ref={avatarRef}
        type="button"
        className="pointer-events-auto fixed left-0 top-0 z-[71] cursor-grab touch-none select-none overflow-hidden rounded-full shadow-[0_10px_36px_-6px_rgba(0,0,0,0.6)] ring-2 ring-leaf/60 transition-shadow hover:shadow-[0_14px_44px_-6px_rgba(0,0,0,0.7)] active:cursor-grabbing"
        style={{ left: 0, top: 0, width: AVATAR, height: AVATAR, transform: `translate3d(${Math.round(pos.x)}px, ${Math.round(pos.y)}px, 0)`, willChange: 'transform' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        aria-label="huzaifa.ai — your support assistant. Drag me anywhere, tap to chat, double-tap for a surprise."
        title="huzaifa.ai — tap to open · double-tap for a surprise · flick me around"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/media/huzaifa-ai.jpg" alt="huzaifa.ai" className="h-full w-full object-cover" draggable={false} />
        {!open && <span className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 animate-pulse rounded-full border-2 border-forest bg-leaf" aria-hidden />}
      </button>
    </div>
  );
}
