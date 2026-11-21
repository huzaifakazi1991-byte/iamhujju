'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { GlassCard } from '@/components/ui/glass';
import { LandingMotion } from '@/components/landing-motion';
import { SocialIcons } from '@/components/social-icons';
import { useToast } from '@/components/toast';

const ABOUT_LEAD =
  'IamHujju is one gateway to the world\u2019s smartest AI models \u2014 ready out of the box, provider-grade the moment a key is in. Start free, experiment boldly, and pay only for the power you actually use.';

const ABOUT_TRUST =
  'Every token is metered honestly and every request is verified on the server \u2014 so you grow on trust, not fine print.';

const ABOUT_PASSION =
  'Artificial intelligence isn\u2019t the future we\u2019re waiting for \u2014 it\u2019s the future we\u2019re building, one model at a time, for every creator, student and business.';

const NARRATION = [
  'Welcome to IamHujju. One gateway to the world\u2019s smartest A I models \u2014 ready out of the box, provider-grade the moment a key is in. Start free, experiment boldly, and pay only for the power you actually use.',
  'Every token is metered honestly, and every request is verified on the server \u2014 so you grow on trust, not fine print.',
  'Our story began in India with one founder\u2019s passion: a deep love for adopting artificial intelligence and a mission to make it effortless and affordable for everyone.',
  'Here, artificial intelligence is not the future we are waiting for \u2014 it is the future we are building, one model at a time, for every creator, student and business.',
  'Start free. Dream big. Grow beyond one model.',
].join(' ');

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const maleHint = /male|ravi|hemant|prabhat|saurabh|rahul|madhur|manoj|vihaan|arjun|neerja-excluded/i;
  const indian = voices.filter((v) => /^en([-_]|$)in/i.test(v.lang));
  const indianMale = indian.find((v) => maleHint.test(v.name));
  if (indianMale) return indianMale;
  if (indian.length) return indian[0];
  const englishMale = voices.find((v) => /^en([-_]|$)/i.test(v.lang) && /\bmale\b/i.test(v.name));
  if (englishMale) return englishMale;
  return voices.find((v) => /^en([-_]|$)/i.test(v.lang)) ?? voices[0] ?? null;
}

export function AboutSection() {
  const [speaking, setSpeaking] = useState(false);
  const [supported, setSupported] = useState(true);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setSupported(false);
      return;
    }
    const load = () => {
      voiceRef.current = pickVoice();
    };
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', load);
      window.speechSynthesis.cancel();
    };
  }, []);

  const toggleSpeech = useCallback(() => {
    if (!('speechSynthesis' in window)) {
      setSupported(false);
      return;
    }
    const synth = window.speechSynthesis;
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    synth.cancel();
    const u = new SpeechSynthesisUtterance(NARRATION);
    const voice = voiceRef.current ?? pickVoice();
    if (voice) {
      u.voice = voice;
      u.lang = /^en([-_])in/i.test(voice.lang) ? voice.lang : 'en-IN';
    } else {
      u.lang = 'en-IN';
    }
    u.rate = 0.98;
    u.pitch = 0.85;
    u.onend = () => setSpeaking(false);
    u.onerror = () => {
      setSpeaking(false);
      toast('Voice narration is unavailable in this browser.', 'error');
    };
    setSpeaking(true);
    synth.speak(u);
  }, [speaking, toast]);

  return (
    <GlassCard className="relative overflow-hidden p-8 sm:p-12" hover>
      <div className="hero-glow pointer-events-none absolute inset-0 opacity-60" />
      <div className="relative grid items-center gap-10 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <LandingMotion>
          <div className="flex flex-col items-center text-center">
          <div className="relative">
            <div
              aria-hidden
              className={`absolute -inset-3 rounded-full bg-gradient-to-tr from-leaf via-leaf-glow to-amber opacity-40 blur-xl transition-opacity duration-500 ${speaking ? 'opacity-80' : ''}`}
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/media/huzaifa-kazi.jpg"
              alt="Huzaifa Kazi, Owner & CEO of IamHujju"
              width={168}
              height={168}
              loading="lazy"
              className={`relative h-40 w-40 rounded-full border border-leaf/40 object-cover shadow-[0_10px_40px_rgba(13,31,21,0.25)] ring-4 ring-leaf/25 dark:ring-leaf/30 sm:h-44 sm:w-44 ${speaking ? 'animate-[pulse_1.6s_ease-in-out_infinite]' : ''}`}
            />
            <span
              aria-hidden
              className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full border border-cream/60 bg-gradient-to-br from-leaf to-leaf-deep text-base shadow-md dark:border-forest"
            >
              🌱
            </span>
          </div>
          <p className="font-display mt-5 text-xl font-bold tracking-tight">Huzaifa Kazi</p>
          <p className="text-caption mt-0.5">Owner &amp; CEO · From India 🇮🇳</p>

          <button
            type="button"
            onClick={toggleSpeech}
            aria-pressed={speaking}
            className="btn-leaf mt-6 inline-flex items-center gap-2.5 px-6 py-2.5 text-sm"
            disabled={!supported}
          >
            {speaking ? (
              <>
                <span className="eq flex h-4 items-end gap-[3px]" aria-hidden>
                  <span className="eq-bar" /><span className="eq-bar" /><span className="eq-bar" /><span className="eq-bar" />
                </span>
                Stop narration
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden>
                  <path d="M12 3v18M7 8v8M3 11v2M17 8v8M21 11v2" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" fill="none" />
                </svg>
                🔊 Listen to our story
              </>
            )}
          </button>
          {supported && (
            <p className="text-caption mt-2 text-[0.7rem] opacity-80">
              English · Indian voice {speaking ? '· narrating…' : ''}
            </p>
          )}
          </div>
        </LandingMotion>

        <LandingMotion delay={0.1}>
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-leaf/35 bg-leaf/10 px-4 py-1 text-sm font-medium text-leaf-deep dark:text-leaf-glow">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-leaf" />
            About us
          </p>
          <h2 className="text-h1">
            Born in India.
            <span className="bg-gradient-to-r from-leaf-deep to-amber bg-clip-text text-transparent dark:from-leaf-glow dark:to-amber"> Built for everyone.</span>
          </h2>
          <p className="text-body-soft mt-5 text-[1.02rem] leading-relaxed">{ABOUT_LEAD}</p>
          <p className="text-body-soft mt-3 text-[1.02rem] leading-relaxed">{ABOUT_TRUST}</p>
          <blockquote className="mt-6 border-l-[3px] border-amber pl-4 font-display text-lg font-semibold leading-snug text-forest dark:text-cream">
            &ldquo;{ABOUT_PASSION}&rdquo;
          </blockquote>
          <div className="glass mt-6 inline-flex flex-wrap items-center gap-2 rounded-2xl px-4 py-2.5 text-sm">
            <span className="inline-block h-2 w-2 rounded-full bg-leaf" />
            <span className="font-semibold">Led by a founder who lives and breathes A.I.</span>
          </div>
          <div className="mt-7">
            <p className="text-caption mb-3 uppercase tracking-widest">Find us on</p>
            <SocialIcons />
          </div>
        </LandingMotion>
      </div>
    </GlassCard>
  );
}
