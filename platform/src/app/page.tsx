'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Nav } from '@/components/nav';
import { LandingMotion } from '@/components/landing-motion';
import { GlassCard } from '@/components/ui/glass';
import { api } from '@/lib/client';

const FEATURES = [
  { icon: '🔀', title: 'One gateway, every provider', body: 'Mistral, OpenAI, Anthropic, Groq or anything OpenAI-compatible — paste a key in the admin vault and its models appear instantly. No redeploys, no code changes.' },
  { icon: '⏱️', title: 'Token metering that adds up', body: 'Every prompt and completion token is counted per request, deducted atomically, and streamed live to your balance. Abandoned streams still bill what was consumed.' },
  { icon: '🔐', title: 'Server-side gating', body: 'Plan, rate limit, daily quota, balance and admin-enabled model are all verified on the server for every single request — never the client.' },
  { icon: '🔑', title: 'Programmatic access', body: 'Create personal API keys and call the OpenAI-compatible /api/v1/chat/completions endpoint from any SDK or tool.' },
];

const STATS = [
  { value: '4', label: 'providers, one gateway' },
  { value: '50M+', label: 'daily tokens on Business' },
  { value: '<1s', label: 'model onboarding after key paste' },
  { value: '100%', label: 'server-side gating' },
];

const TRUST = ['OpenAI-compatible', 'Mistral', 'Anthropic', 'Groq', 'Streaming SSE', 'Stripe billing', 'Neon Postgres', 'Redis rate limits'];

export default function LandingPage() {
  const [authed, setAuthed] = useState(false);
  useEffect(() => {
    api('/api/auth/me').then(() => setAuthed(true)).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen">
      <Nav />
      <main>
        <section className="hero-glow">
          <div className="mx-auto max-w-6xl px-4 pb-24 pt-24 text-center sm:px-6 sm:pt-32">
            <LandingMotion>
              <motion.p
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="mb-6 inline-flex items-center gap-2 rounded-full border border-leaf/35 bg-leaf/10 px-4 py-1 text-sm font-medium text-leaf-deep dark:text-leaf-glow"
              >
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-leaf" />
                Runs out of the box on the built-in mock provider
              </motion.p>
              <h1 className="text-display mx-auto max-w-5xl">
                <motion.span
                  className="block"
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.7, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
                >
                  Grow beyond
                </motion.span>
                <motion.span
                  className="block"
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.7, delay: 0.22, ease: [0.22, 1, 0.36, 1] }}
                >
                  one model.{' '}
                  <span className="bg-gradient-to-r from-leaf-deep via-leaf-glow to-amber bg-clip-text text-transparent dark:from-leaf-glow dark:via-leaf dark:to-amber">
                    For everyone.
                  </span>
                </motion.span>
              </h1>
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.36, ease: [0.22, 1, 0.36, 1] }}
                className="text-body-soft mx-auto mt-7 max-w-2xl text-lg leading-relaxed"
              >
                A multi-provider AI playground with transparent metering. Sign up free, chat instantly on the mock provider, upgrade when you outgrow it.
              </motion.p>
              <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
                {authed ? (
                  <Link href="/playground" className="btn-leaf px-8 py-3 text-base">Open your playground</Link>
                ) : (
                  <Link href="/signup" className="btn-leaf px-8 py-3 text-base">Start free</Link>
                )}
                <Link href={authed ? '/pricing' : '/playground'} className="btn-ghost px-8 py-3 text-base">
                  {authed ? 'See pricing' : 'Open playground →'}
                </Link>
              </div>
            </LandingMotion>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
          <div className="trust-mask overflow-hidden py-6">
            <div className="trust-track">
              {[...TRUST, ...TRUST].map((t, i) => (
                <span key={i} className="text-caption whitespace-nowrap opacity-75">{t}</span>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
          <LandingMotion>
            <div className="glass mx-auto grid max-w-3xl grid-cols-2 gap-6 rounded-[1.5rem] p-8 sm:grid-cols-4">
              {STATS.map((s) => (
                <div key={s.label} className="text-center">
                  <p className="text-num text-h2 text-leaf-deep dark:text-leaf">{s.value}</p>
                  <p className="mt-1 text-xs leading-snug text-body-soft">{s.label}</p>
                </div>
              ))}
            </div>
          </LandingMotion>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
          <div className="grid gap-5 sm:grid-cols-2">
            {FEATURES.map((f, i) => (
              <LandingMotion key={f.title} delay={i * 0.08}>
                <GlassCard hover className="h-full p-7">
                  <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-leaf/25 bg-leaf/10 text-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]">{f.icon}</div>
                  <h3 className="font-display mb-2 text-lg font-bold tracking-tight">{f.title}</h3>
                  <p className="text-body-soft text-[0.95rem] leading-relaxed">{f.body}</p>
                </GlassCard>
              </LandingMotion>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
          <LandingMotion>
            <GlassCard className="relative overflow-hidden p-10 text-center sm:p-14">
              <div className="hero-glow pointer-events-none absolute inset-0" />
              <div className="relative">
                <h2 className="text-h1">Free to start. Honest about limits.</h2>
                <p className="text-body-soft mx-auto mt-4 max-w-xl text-lg">
                  The Free tier includes daily tokens and core models. Paid tiers unlock every enabled model with much larger quotas.
                </p>
                <Link href="/pricing" className="btn-primary mt-9 inline-block px-8 py-3">See pricing</Link>
              </div>
            </GlassCard>
          </LandingMotion>
        </section>
      </main>

      <footer className="border-t border-forest/8 py-8 dark:border-white/10">
        <div className="text-body-soft mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 text-sm sm:flex-row sm:px-6">
          <span>© {new Date().getFullYear()} IamHujju — grown, not gated.</span>
          <div className="flex flex-wrap justify-center gap-5 sm:justify-end">
            <Link href="/pricing" className="transition-colors hover:text-leaf">Pricing</Link>
            <Link href="/playground" className="transition-colors hover:text-leaf">Playground</Link>
            <Link href="/dashboard" className="transition-colors hover:text-leaf">Dashboard</Link>
            <Link href="/privacy" className="transition-colors hover:text-leaf">Privacy</Link>
            <Link href="/terms" className="transition-colors hover:text-leaf">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
