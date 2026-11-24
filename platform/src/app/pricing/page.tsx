import Link from 'next/link';
import { Nav } from '@/components/nav';
import { LandingMotion } from '@/components/landing-motion';
import { GlassCard } from '@/components/ui/glass';
import { getSessionClaims } from '@/lib/session';
import { resolvePlan } from '@/lib/gateway/run';
import { PLAN_FACTS, YEARLY_DISCOUNT, formatInrRupees, formatTokens } from '@/lib/plans';

export const dynamic = 'force-dynamic';

// Numbers come from lib/plans.ts (single source of truth shared with seed + prompts);
// only marketing copy is authored here.
const PLAN_COPY: Record<string, { tagline: string; items: string[] }> = {
  free: {
    tagline: 'Everything you need to try it.',
    items: ['Free-tier enabled models', 'Playground + conversation history', 'Community support'],
  },
  pro: {
    tagline: 'For daily builders.',
    items: ['All enabled models', 'API keys for programmatic access', 'Priority support'],
  },
  business: {
    tagline: 'Scale without ceilings.',
    items: ['Every enabled model', 'Usage analytics export', 'Dedicated support'],
  },
};

const PLANS = PLAN_FACTS.map((f) => ({
  slug: f.slug,
  name: f.name,
  featured: f.slug === 'pro',
  price: formatInrRupees(f.priceMonthlyInrPaise),
  yearly: f.priceYearlyInrPaise !== null
    ? `${formatInrRupees(f.priceYearlyInrPaise)} / year — save ${YEARLY_DISCOUNT * 100}%`
    : null,
  ...PLAN_COPY[f.slug],
  items: [
    `${formatTokens(f.dailyTokens)} tokens / day`,
    `${formatTokens(f.monthlyTokens)} tokens / month`,
    `${f.requestsPerMin} requests / minute`,
    ...PLAN_COPY[f.slug].items,
  ],
}));

export default async function PricingPage() {
  const claims = await getSessionClaims();
  const authed = !!claims;
  const currentPlanSlug = claims ? ((await resolvePlan(claims.sub))?.slug ?? 'free') : null;
  const tierOf = (slug: string) => PLANS.findIndex((p) => p.slug === slug);
  return (
    <div className="min-h-screen">
      <Nav />
      <main className="hero-glow min-h-[70vh] px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <LandingMotion>
            <h1 className="text-h1 text-center sm:text-display sm:!text-[clamp(2.5rem,5vw,3.5rem)]">Simple, honest pricing.</h1>
            <p className="text-body-soft mx-auto mt-4 max-w-xl text-center text-lg">
              Pay for tokens, not seats. Upgrade or cancel any time — plus pay-as-you-go top-ups (from ₹499) whenever you need a bigger balance.
            </p>
          </LandingMotion>
          <div className="mt-14 grid gap-6 lg:grid-cols-3 lg:pt-4">
            {PLANS.map((p, i) => (
              <LandingMotion key={p.slug} delay={i * 0.08}>
                <GlassCard
                  hover
                  className={`relative flex h-full flex-col p-8 ${p.featured ? 'shadow-[0_0_0_2px_var(--color-amber),0_24px_64px_-24px_rgba(245,178,60,0.5)]' : ''}`}
                >
                  {p.featured && (
                    <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-b from-amber to-amber-deep px-4 py-1 text-xs font-bold tracking-wide text-[#241703] shadow-lg">
                      MOST POPULAR
                    </span>
                  )}
                  <h2 className="font-display text-xl font-bold">{p.name}</h2>
                  <p className="text-body-soft mt-1 text-sm">{p.tagline}</p>
                  <div className="mt-6 flex items-baseline gap-1">
                    <span className="text-num text-4xl">{p.price}</span>
                    <span className="text-body-soft text-sm">/ month</span>
                  </div>
                  {p.yearly && <p className="text-leaf mt-1 text-xs">{p.yearly}</p>}
                  <ul className="mt-6 flex flex-1 flex-col gap-2.5 text-sm">
                    {p.items.map((item) => (
                      <li key={item} className="flex items-start gap-2">
                        <span className="mt-0.5 text-leaf" aria-hidden>✓</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                  {currentPlanSlug === p.slug ? (
                    <span className="mt-8 block rounded-full bg-green-100 py-2.5 text-center text-sm font-semibold text-green-700 dark:bg-green-900 dark:text-green-200">Your current plan</span>
                  ) : p.slug === 'free' && authed && currentPlanSlug !== 'free' ? (
                    <span className="mt-8 block rounded-full bg-black/5 py-2.5 text-center text-sm dark:bg-white/10">Included with your plan</span>
                  ) : (
                  <Link
                    href={p.slug === 'free' ? (authed ? '/playground' : '/signup') : (authed ? `/billing?plan=${p.slug}` : '/login')}
                    className={`mt-8 block rounded-full py-2.5 text-center text-sm font-semibold ${p.featured ? 'btn-primary' : 'btn-ghost'}`}
                  >
                    {p.slug === 'free'
                      ? 'Start free'
                      : currentPlanSlug && tierOf(p.slug) < tierOf(currentPlanSlug)
                        ? `Switch to ${p.name}`
                        : `Upgrade to ${p.name}`}
                  </Link>
                  )}
                </GlassCard>
              </LandingMotion>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
