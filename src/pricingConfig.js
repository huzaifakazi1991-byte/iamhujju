/**
 * Single Source of Truth for Pricing across iamhujju.com
 * Shared between frontend UI (PricingPage, HomePage, DocsModal, AccountMenu, PaymentModal)
 * and server.js (Razorpay order creation and signature verification).
 */

export const CURRENCY = 'INR';
export const CURRENCY_SYMBOL = '₹';

export const PRICING_PLANS = {
  free: {
    planId: 'free',
    basePlanId: 'free',
    name: 'Free',
    title: 'Free Plan',
    category: 'Getting started',
    amountInr: 0,
    amountPaise: 0,
    amountFormatted: '₹0',
    billingCycle: 'monthly',
    amountUsd: '$0 / mo',
    description: 'Perfect for testing and personal experimentation.',
    tokens: '100K / day',
    users: 'Unlimited',
    features: [
      'All free models (DeepSeek, Llama, Gemma, etc.)',
      'iamhujju SDK & AnyCLI Access',
      'AnyChat Playground & Companion Workspace'
    ],
    highlights: 'No credit card required · Community support · Instant setup',
    ctaText: 'Start for free',
    isFree: true
  },
  payg: {
    planId: 'payg',
    basePlanId: 'payg',
    name: 'Pay-as-you-go',
    title: 'Pay-as-you-go',
    category: 'Flexible usage',
    amountInr: 1699,
    amountPaise: 169900,
    amountFormatted: '₹1,699',
    billingCycle: 'once',
    amountUsd: 'From $20',
    description: 'Only pay for what you consume. Zero monthly commitment.',
    tokens: '80 M+',
    users: 'Unlimited',
    features: [
      'All 400+ models included',
      'iamhujju SDK · AnyCLI · AnyChat',
      'BYOK (Bring Your Own Key) zero markup'
    ],
    highlights: 'No monthly commitment · Scale as needed · Standard support · Usage-based billing',
    ctaText: 'Choose Pay-as-you-go',
    isFree: false
  },
  developer_monthly: {
    planId: 'developer_monthly',
    basePlanId: 'developer',
    name: 'Developer Monthly',
    title: 'Developer Plan',
    category: 'Side projects & MVPs',
    amountInr: 1699,
    amountPaise: 169900,
    amountFormatted: '₹1,699 / mo',
    billingCycle: 'monthly',
    amountUsd: '$19.90 / mo',
    description: 'Ideal for small projects, personal companion apps, and MVPs.',
    tokens: '100 M (Rollover)',
    users: 'Unlimited',
    features: [
      'All 400+ models unlocked',
      'iamhujju SDK · AnyCLI · AnyChat',
      'Cloud conversation sync & storage'
    ],
    highlights: 'Standard support · Shared high-speed infra · Basic analytics',
    ctaText: 'Upgrade to Developer',
    isFree: false
  },
  developer_annual: {
    planId: 'developer_annual',
    basePlanId: 'developer',
    name: 'Developer Annual',
    title: 'Developer Plan (Annual)',
    category: 'Side projects & MVPs',
    amountInr: 16308,
    amountPaise: 1630800,
    amountFormatted: '₹16,308 / yr (₹1,359/mo)',
    monthlyEquivalentInr: 1359,
    billingCycle: 'annual',
    amountUsd: '≈ $15.90 / mo (billed ₹16,308/yr)',
    savings: 'SAVE 20%',
    description: 'Ideal for small projects, personal companion apps, and MVPs.',
    tokens: '100 M (Rollover)',
    users: 'Unlimited',
    features: [
      'All 400+ models unlocked',
      'iamhujju SDK · AnyCLI · AnyChat',
      'Cloud conversation sync & storage',
      'Annual 20% discount included'
    ],
    highlights: 'Standard support · Shared high-speed infra · Basic analytics',
    ctaText: 'Upgrade to Developer (Annual)',
    isFree: false
  },
  pro_monthly: {
    planId: 'pro_monthly',
    basePlanId: 'pro',
    name: 'Pro Monthly',
    title: 'Pro Plan',
    category: 'Growing teams & startups',
    amountInr: 8199,
    amountPaise: 819900,
    amountFormatted: '₹8,199 / mo',
    billingCycle: 'monthly',
    amountUsd: '$95.90 / mo',
    isPopular: true,
    description: 'Scales with growing projects and high-volume workloads.',
    tokens: '500 M (Rollover)',
    users: 'Unlimited',
    features: [
      'All 400+ frontier & open models',
      'iamhujju SDK · AnyCLI · AnyChat',
      'Priority smart routing & auto-failover',
      '120 RPM rate limits & zero queueing'
    ],
    highlights: 'Priority support · Team collaboration · Advanced analytics · 99.9% Uptime',
    ctaText: 'Upgrade to Pro',
    isFree: false
  },
  pro_annual: {
    planId: 'pro_annual',
    basePlanId: 'pro',
    name: 'Pro Annual',
    title: 'Pro Plan (Annual)',
    category: 'Growing teams & startups',
    amountInr: 78708,
    amountPaise: 7870800,
    amountFormatted: '₹78,708 / yr (₹6,559/mo)',
    monthlyEquivalentInr: 6559,
    billingCycle: 'annual',
    amountUsd: '≈ $76.70 / mo (billed ₹78,708/yr)',
    isPopular: true,
    savings: 'SAVE 20%',
    description: 'Scales with growing projects and high-volume workloads.',
    tokens: '500 M (Rollover)',
    users: 'Unlimited',
    features: [
      'All 400+ frontier & open models',
      'iamhujju SDK · AnyCLI · AnyChat',
      'Priority smart routing & auto-failover',
      '120 RPM rate limits & zero queueing',
      'Annual 20% discount included'
    ],
    highlights: 'Priority support · Team collaboration · Advanced analytics · 99.9% Uptime',
    ctaText: 'Upgrade to Pro (Annual)',
    isFree: false
  },
  enterprise_monthly: {
    planId: 'enterprise_monthly',
    basePlanId: 'enterprise',
    name: 'Enterprise Monthly',
    title: 'Enterprise Plan',
    category: 'Large teams & production apps',
    amountInr: 23999,
    amountPaise: 2399900,
    amountFormatted: '₹23,999 / mo',
    billingCycle: 'monthly',
    amountUsd: '$279.90 / mo',
    description: 'Mission-critical apps, custom model deployments, and SLAs.',
    tokens: 'Custom / 1.5 B+',
    users: 'Unlimited',
    features: [
      'Custom rate limits & dedicated inference pools',
      'SOC2 / HIPAA compliance assistance',
      'Dedicated Slack/Telegram engineering channel',
      'Custom fine-tuned models & prompt caches'
    ],
    highlights: 'Dedicated support · Custom integrations · Advanced logging · 99.99% SLA',
    ctaText: 'Upgrade or Contact Enterprise',
    isFree: false
  },
  enterprise_annual: {
    planId: 'enterprise_annual',
    basePlanId: 'enterprise',
    name: 'Enterprise Annual',
    title: 'Enterprise Plan (Annual)',
    category: 'Large teams & production apps',
    amountInr: 230388,
    amountPaise: 23038800,
    amountFormatted: '₹230,388 / yr (₹19,199/mo)',
    monthlyEquivalentInr: 19199,
    billingCycle: 'annual',
    amountUsd: '≈ $223.90 / mo (billed ₹230,388/yr)',
    savings: 'SAVE 20%',
    description: 'Mission-critical apps, custom model deployments, and SLAs.',
    tokens: 'Custom / 1.5 B+',
    users: 'Unlimited',
    features: [
      'Custom rate limits & dedicated inference pools',
      'SOC2 / HIPAA compliance assistance',
      'Dedicated Slack/Telegram engineering channel',
      'Custom fine-tuned models & prompt caches',
      'Annual 20% discount included'
    ],
    highlights: 'Dedicated support · Custom integrations · Advanced logging · 99.99% SLA',
    ctaText: 'Upgrade or Contact Enterprise (Annual)',
    isFree: false
  }
};

// Aliases for base plan names to monthly defaults
PRICING_PLANS.developer = PRICING_PLANS.developer_monthly;
PRICING_PLANS.pro = PRICING_PLANS.pro_monthly;
PRICING_PLANS.enterprise = PRICING_PLANS.enterprise_monthly;

/**
 * Resolves a plan definition by ID or ID + billing cycle.
 * Handles both composite IDs (e.g., 'pro_annual') and base IDs + cycle ('pro', 'annual').
 */
export function resolvePlan(planIdOrObject, billingCycle = 'monthly') {
  if (!planIdOrObject) return PRICING_PLANS.pro_monthly;

  if (typeof planIdOrObject === 'object') {
    if (planIdOrObject.amountInr !== undefined && planIdOrObject.planId) {
      return planIdOrObject;
    }
    return resolvePlan(planIdOrObject.planId, planIdOrObject.billingCycle || billingCycle);
  }

  const rawId = String(planIdOrObject).trim().toLowerCase();
  const cycle = (billingCycle || 'monthly').toLowerCase();

  // If already a composite key (e.g. 'pro_monthly', 'pro_annual')
  if (PRICING_PLANS[rawId] && rawId.includes('_')) {
    return PRICING_PLANS[rawId];
  }

  // If base ID + cycle requested (e.g. 'pro' + 'annual' -> 'pro_annual')
  const compositeKey = `${rawId}_${cycle}`;
  if (PRICING_PLANS[compositeKey]) {
    return PRICING_PLANS[compositeKey];
  }

  // Base key directly in dictionary (e.g. 'payg', 'free')
  if (PRICING_PLANS[rawId]) {
    return PRICING_PLANS[rawId];
  }

  return PRICING_PLANS.pro_monthly;
}
