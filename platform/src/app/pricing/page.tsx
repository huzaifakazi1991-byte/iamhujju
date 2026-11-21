import Link from 'next/link';
import { Nav } from '@/components/nav';
import { LandingMotion } from '@/components/landing-motion';
import { GlassCard } from '@/components/ui/glass';

export const dynamic = 'force-dynamic';

const PLANS = [
  {
    slug: 'free', name: 'Free', price: '$0', tagline: 'Everything you need to try it.',
    items: ['10,000 tokens / day', '100,000 tokens / month', 'Free-tier enabled models', 'Playground + conversation history', 'Community support'],
  },
  {
    slug: 'pro', name: 'Pro', price: '$20', tagline: 'For daily builders.',
    items: ['200,000 tokens / day', '4M tokens / month', 'All enabled models incl. Pro', '60 requests / minute', 'API keys for programmatic access', 'Priority support'],
    featured: true,
  },
  {
    slug: 'business', name: 'Business', price: '$100', tagline: 'Scale without ceilings.',
    items: ['2M tokens / day', '40M tokens / month', 'Every enabled model', '300 requests / minute', 'Usage analytics export', 'Dedicated support'],
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen">
      <Nav />
      <main className="hero-glow min-h-[70vh] px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <LandingMotion>
            <h1 className="text-h1 text-center sm:text-display sm:!text-[clamp(2.5rem,5vw,3.5rem)]">Simple, honest pricing.</h1>
            <p className="text-body-soft mx-auto mt-4 max-w-xl text-center text-lg">
              Pay for tokens, not seats. Upgrade or cancel any time.
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
                  <ul className="mt-6 flex flex-1 flex-col gap-2.5 text-sm">
                    {p.items.map((item) => (
                      <li key={item} className="flex items-start gap-2">
                        <span className="mt-0.5 text-leaf" aria-hidden>✓</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={p.slug === 'free' ? '/signup' : `/billing?plan=${p.slug}`}
                    className={`mt-8 block rounded-full py-2.5 text-center text-sm font-semibold ${p.featured ? 'btn-primary' : 'btn-ghost'}`}
                  >
                    {p.slug === 'free' ? 'Start free' : `Upgrade to ${p.name}`}
                  </Link>
                </GlassCard>
              </LandingMotion>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
