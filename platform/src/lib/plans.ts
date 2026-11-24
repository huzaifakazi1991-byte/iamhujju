/**
 * Single source of truth for commercial plan facts.
 *
 * Imported by prisma/seed.ts (DB), app/pricing (marketing surface) and
 * lib/assistant-knowledge.ts (prompt surface), so admin-visible copy,
 * seeded billing tiers and AI-assistant answers can never disagree.
 * prices are INR paise (ints) — USD values are derived, never stored lane.
 */

export const SUPPORT_EMAIL = 'huzaifakazi1991@gmail.com';

/** Fallback INR→USD conversion used by billing when a plan lacks a USD price (matches RAZORPAY_USD_TO_INR default). */
export const USD_PER_INR = 88;

/** Yearly billing discount as a plain number (0.1 = 10% off). */
export const YEARLY_DISCOUNT = 0.1;

export type PlanSlug = 'free' | 'pro' | 'business';

export type PlanFact = {
  slug: PlanSlug;
  name: string;
  isFree: boolean;
  /** INR minor units (paise) for a monthly subscription. */
  priceMonthlyInrPaise: number;
  /** INR paise for yearly billing; null when yearly billing is not offered. */
  priceYearlyInrPaise: number | null;
  dailyTokens: number;
  monthlyTokens: number;
  tokensPerMinute: number;
  requestsPerMin: number;
};

export const PLAN_FACTS: readonly PlanFact[] = [
  {
    slug: 'free', name: 'Free', isFree: true,
    priceMonthlyInrPaise: 0, priceYearlyInrPaise: null,
    dailyTokens: 10_000, monthlyTokens: 100_000,
    tokensPerMinute: 6_000, requestsPerMin: 10,
  },
  {
    slug: 'pro', name: 'Pro', isFree: false,
    priceMonthlyInrPaise: 129_900, priceYearlyInrPaise: 1_402_900,
    dailyTokens: 200_000, monthlyTokens: 4_000_000,
    tokensPerMinute: 60_000, requestsPerMin: 60,
  },
  {
    slug: 'business', name: 'Business', isFree: false,
    priceMonthlyInrPaise: 899_900, priceYearlyInrPaise: 9_718_900,
    dailyTokens: 2_000_000, monthlyTokens: 40_000_000,
    tokensPerMinute: 250_000, requestsPerMin: 300,
  },
];

/** "₹1,299" style — en-IN grouping on whole rupees. */
export function formatInrRupees(paise: number): string {
  if (paise === 0) return '₹0';
  return `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;
}

/** "10,000" / "4M" style for token grants. */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${n / 1_000_000}M`;
  return n.toLocaleString('en-US');
}

/** USD cents for monthly billing, derived from INR paise (never stored separately). */
export function priceMonthlyUsdCents(f: PlanFact): number {
  return Math.round(f.priceMonthlyInrPaise / USD_PER_INR);
}

/** USD cents for yearly billing, or null. */
export function priceYearlyUsdCents(f: PlanFact): number | null {
  return f.priceYearlyInrPaise === null ? null : Math.round(f.priceYearlyInrPaise / USD_PER_INR);
}

/** One-line human summary, e.g. "Pro ₹1,299/month (₹14,029/year, 10% off) — 200,000 tokens/day, 4M/month, 60 req/min, all enabled models". */
export function planSummary(f: PlanFact): string {
  const price = f.isFree
    ? `${f.name} ${formatInrRupees(f.priceMonthlyInrPaise)}`
    : `${f.name} ${formatInrRupees(f.priceMonthlyInrPaise)}/month${
        f.priceYearlyInrPaise !== null
          ? ` (${formatInrRupees(f.priceYearlyInrPaise)}/year, ${YEARLY_DISCOUNT * 100}% off)`
          : ''
      }`;
  return `${price} — ${formatTokens(f.dailyTokens)} tokens/day, ${formatTokens(f.monthlyTokens)}/month, ${f.requestsPerMin} req/min`;
}

export function planBySlug(slug: string): PlanFact {
  const f = PLAN_FACTS.find((p) => p.slug === slug);
  if (!f) throw new Error(`Unknown plan slug: ${slug}`);
  return f;
}
