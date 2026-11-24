import { describe, expect, it } from 'vitest';
import {
  ASSISTANT_NAME,
  ASSISTANT_SYSTEM_PROMPT,
  FAQ,
  faqAnswer,
} from '../src/lib/assistant-knowledge';
import {
  PLAN_FACTS,
  SUPPORT_EMAIL,
  USD_PER_INR,
  YEARLY_DISCOUNT,
  formatInrRupees,
  formatTokens,
  planSummary,
  priceMonthlyUsdCents,
  priceYearlyUsdCents,
} from '../src/lib/plans';

const SECRETISH = new RegExp(
  [
    'DATABASE_URL', 'JWT_SECRET', 'KEY_ENCRYPTION_SECRET', 'SMTP_URL',
    'STRIPE_SECRET', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET',
    'GOOGLE_CLIENT_SECRET', 'REDIS_URL', 'ADMIN_PASSWORD', 'sk-', 'live_',
  ].join('|'),
);

const KNOWN_SEGMENTS = new Set([
  'pricing', 'signup', 'login', 'playground', 'dashboard',
  'billing', 'keys', 'settings', 'admin', 'privacy', 'terms',
]);
const KNOWN_FULL_PATHS = new Set(['/api/v1/chat/completions']);

/** Matches real route mentions (whitespace/paren/bold-prefixed `/word`), not domains or `tokens/day` prose. */
function routesMentioned(text: string): string[] {
  const matches = [...text.matchAll(/(^|[\s(*])\/(?:api\/[a-z0-9./-]+|[a-z][a-z-]*)(?=[),.;:!\s]|$|[a-z- ]*\*\*)/g)];
  return [...new Set(matches.map((m) => m[0].replace(/^[\s(*]+/, '').replace(/^\//, '').replace(/\*+$/, '')))];
}

function expectRealRoute(route: string) {
  if (route === '' || route === '/' ) return;
  if (route.startsWith('api/')) {
    expect(KNOWN_FULL_PATHS.has(`/${route}`), `unknown API path /${route}`).toBe(true);
    return;
  }
  const segment = route.split('/')[0];
  expect(KNOWN_SEGMENTS.has(segment), `unknown route /${route}`).toBe(true);
}

describe('prompt facts: single source of truth (plans.ts)', () => {
  it('derived yearly price = monthly × 12 × (1 − yearly discount)', () => {
    for (const f of PLAN_FACTS.filter((f) => !f.isFree)) {
      const expected = Math.round((f.priceMonthlyInrPaise / 100) * 12 * (1 - YEARLY_DISCOUNT)) * 100;
      expect(f.priceYearlyInrPaise).toBe(expected);
    }
  });

  it('derived USD-cent prices match INR paise ÷ 88', () => {
    for (const f of PLAN_FACTS) {
      expect(priceMonthlyUsdCents(f)).toBe(Math.round(f.priceMonthlyInrPaise / USD_PER_INR));
      if (f.priceYearlyInrPaise === null) {
        expect(priceYearlyUsdCents(f)).toBeNull();
      } else {
        expect(priceYearlyUsdCents(f)).toBe(Math.round(f.priceYearlyInrPaise / USD_PER_INR));
      }
    }
  });

  it('known plan values pinned (Pro ₹1,299 / Business ₹8,999, 10% yearly off)', () => {
    expect(formatInrRupees(129_900)).toBe('₹1,299');
    expect(formatInrRupees(1_402_900)).toBe('₹14,029');
    expect(formatInrRupees(899_900)).toBe('₹8,999');
    expect(formatInrRupees(9_718_900)).toBe('₹97,189');
    expect(formatTokens(100_000)).toBe('100,000');
    expect(formatTokens(4_000_000)).toBe('4M');
  });

  it('system prompt embeds every plan summary verbatim', () => {
    for (const f of PLAN_FACTS) {
      expect(ASSISTANT_SYSTEM_PROMPT).toContain(planSummary(f));
    }
  });

  it('system prompt mentions the support email', () => {
    expect(ASSISTANT_SYSTEM_PROMPT).toContain(SUPPORT_EMAIL);
  });
});

describe('prompt hygiene', () => {
  it('names the assistant and enforces a reply budget', () => {
    expect(ASSISTANT_SYSTEM_PROMPT).toContain(ASSISTANT_NAME);
    expect(ASSISTANT_SYSTEM_PROMPT).toContain('under 120 words');
  });

  it('system prompt never mentions secret env names or key prefixes', () => {
    expect(SECRETISH.test(ASSISTANT_SYSTEM_PROMPT)).toBe(false);
  });

  it('system prompt carries guardrails against config/user-data disclosure', () => {
    expect(ASSISTANT_SYSTEM_PROMPT).toContain('GUARDRAILS');
    expect(ASSISTANT_SYSTEM_PROMPT.toLowerCase()).toContain('never reveal');
  });

  it('system prompt routes stay inside the real route map', () => {
    for (const r of routesMentioned(ASSISTANT_SYSTEM_PROMPT)) {
      expectRealRoute(r);
    }
  });

  it('system prompt stays within a sane token budget (< 450 words)', () => {
    const words = ASSISTANT_SYSTEM_PROMPT.split(/\s+/).length;
    expect(words).toBeLessThan(450);
  });
});

describe('FAQ knowledge base', () => {
  const representative: Array<[RegExp, string]> = [
    [/price|plan/i, '₹1,299'],
    [/token|balance/i, '/dashboard'],
    [/sign\s?up|create account/i, '/signup'],
    [/api|programmatic/i, '/api/v1/chat/completions'],
    [/csv|export/i, 'Export CSV'],
    [/razorpay|pay|refund/i, 'Razorpay'],
    [/privacy|terms/i, '/privacy'],
    [/mistral|openai|provider/i, 'Admin'],
    [/support|bug|broken/i, SUPPORT_EMAIL],
  ];

  it('routes common questions to the right knowledge entry', () => {
    for (const [question, mustContain] of representative) {
      const topicAnswer = faqAnswer(faqProbe(question));
      expect(topicAnswer, `routing failed for ${question}`).toContain(mustContain);
    }
  });

  it('unknown questions get a fallback that lists topics and gives support email', () => {
    const answer = faqAnswer('zxq quux fluffy wumpus');
    expect(answer).toContain('Plans & pricing');
    expect(answer).toContain(SUPPORT_EMAIL);
  });

  for (const entry of FAQ) {
    it(`entry "${entry.keywords[0]}" avoids secrets, stays < 150 words, mentions only real routes`, () => {
      expect(SECRETISH.test(entry.answer)).toBe(false);
      expect(entry.answer.split(/\s+/).length).toBeLessThan(150);
      for (const r of routesMentioned(entry.answer)) {
        expectRealRoute(r);
      }
    });
  }
});

/** Build a bare question string from a regex, e.g. /price|plan/i → "price". */
function faqProbe(re: RegExp): string {
  const topic = re.source.split('|').filter((s) => !/[^a-z\s]/.test(s));
  return topic.length ? topic[0] : re.source.replace(/[^a-z]/g, '');
}
