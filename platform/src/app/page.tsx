import Link from 'next/link';
import { Nav } from '@/components/nav';
import { LandingMotion } from '@/components/landing-motion';

const FEATURES = [
  { icon: '🔀', title: 'One gateway, every provider', body: 'Mistral, OpenAI, Anthropic, Groq or anything OpenAI-compatible — paste a key in the admin vault and its models appear instantly. No redeploys, no code changes.' },
  { icon: '⏱️', title: 'Token metering that adds up', body: 'Every prompt and completion token is counted per request, deducted atomically, and streamed live to your balance. Abandoned streams still bill what was consumed.' },
  { icon: '🔐', title: 'Server-side gating', body: 'Plan, rate limit, daily quota, balance and admin-enabled model are all verified on the server for every single request — never the client.' },
  { icon: '🔑', title: 'Programmatic access', body: 'Create personal API keys and call the OpenAI-compatible /api/v1/chat/completions endpoint from any SDK or tool.' },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <Nav />
      <main>
        <section className="hero-glow">
          <div className="mx-auto max-w-6xl px-4 pb-24 pt-20 text-center sm:px-6 sm:pt-28">
            <LandingMotion>
              <p className="mb-5 inline-block rounded-full border border-agent/30 bg-agent/10 px-4 py-1 text-sm font-medium text-agent-deep dark:text-agent">
                Runs out of the box on the built-in mock provider
              </p>
              <h1 className="mx-auto max-w-4xl text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-6xl">
                Frontier AI, <span className="text-agent">for everyone.</span>
              </h1>
              <p className="mx-auto mt-6 max-w-2xl text-lg text-ink-soft dark:text-white/65">
                A multi-provider AI playground with transparent metering. Sign up free, chat instantly on the mock provider, upgrade when you outgrow it.
              </p>
              <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link href="/signup" className="btn-primary px-7 py-3 text-base">Start free</Link>
                <Link href="/playground" className="btn-ghost px-7 py-3 text-base">Open playground →</Link>
              </div>
            </LandingMotion>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
          <div className="grid gap-5 sm:grid-cols-2">
            {FEATURES.map((f, i) => (
              <LandingMotion key={f.title} delay={i * 0.08}>
                <div className="card h-full p-7">
                  <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-agent/10 text-2xl">{f.icon}</div>
                  <h3 className="mb-2 text-lg font-bold">{f.title}</h3>
                  <p className="text-[0.95rem] leading-relaxed text-ink-soft dark:text-white/65">{f.body}</p>
                </div>
              </LandingMotion>
            ))}
          </div>
        </section>

        <section className="border-t border-black/5 bg-cream-deep py-20 dark:border-white/10 dark:bg-night-soft">
          <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
            <LandingMotion>
              <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Free to start. Honest about limits.</h2>
              <p className="mx-auto mt-4 max-w-xl text-ink-soft dark:text-white/65">
                The Free tier includes daily tokens and core models. Paid tiers unlock every enabled model with much larger quotas.
              </p>
              <Link href="/pricing" className="btn-primary mt-8 inline-block px-7 py-3">See pricing</Link>
            </LandingMotion>
          </div>
        </section>
      </main>

      <footer className="border-t border-black/5 py-8 dark:border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 text-sm text-ink-soft sm:flex-row sm:px-6 dark:text-white/50">
          <span>© {new Date().getFullYear()} IamHujju</span>
          <div className="flex gap-5">
            <Link href="/pricing" className="hover:text-agent">Pricing</Link>
            <Link href="/playground" className="hover:text-agent">Playground</Link>
            <Link href="/dashboard" className="hover:text-agent">Dashboard</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
