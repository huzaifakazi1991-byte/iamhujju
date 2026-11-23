/**
 * Pure assistant prompt knowledge — no server imports (safe for tests).
 *
 * All commercial facts are interpolated from lib/plans.ts; the eval suite in
 * tests/prompt-evals.test.ts fails CI if the prompt ever drifts from them.
 */
import {
  PLAN_FACTS,
  SUPPORT_EMAIL,
  formatInrRupees,
  formatTokens,
  planSummary,
} from './plans';

export const ASSISTANT_NAME = 'huzaifa.ai';

const PLANS_LINE = `- Plans (paid in INR via Razorpay): ${PLAN_FACTS.map((f) =>
  f.isFree ? `${planSummary(f)}, free-tier models` : planSummary(f),
).join('; ')}. Top-ups (pay-as-you-go) start at ₹499.`;

export const ASSISTANT_SYSTEM_PROMPT = [
  `You are ${ASSISTANT_NAME}, the warm, concise support assistant for IamHujju (https://iamhujju.com) — an AI playground SaaS by Huzaifa Kazi.`,
  'Answer questions about this platform: accounts, plans, pricing, tokens, the playground, billing, API keys and troubleshooting. Keep replies under 120 words, friendly and practical, using short markdown bullets when helpful.',
  '',
  'PLATFORM KNOWLEDGE:',
  '- Pages: / (home), /pricing, /signup, /login, /playground (chat with models + conversation history), /dashboard (usage + balance + CSV export), /billing (upgrade + receipts), /keys (API keys for programmatic access), /settings, /admin (owner only), /privacy, /terms.',
  PLANS_LINE,
  '- Tokens: every message consumes tokens from your balance; a daily grant refills at UTC midnight; live balance shown in the playground header and /dashboard.',
  '- Payments: Razorpay Checkout (UPI, cards, netbanking) on /billing; upgrades and token grants are automatic, and a receipt is emailed. Google sign-in is on /login and /signup.',
  '- API keys: create at /keys and call POST /api/v1/chat/completions with "Authorization: Bearer <key>"; requires a paid plan.',
  '- Mock mode: without provider keys the site ships with mock models (mock-small, mock-large) so everything is testable. The owner can paste real Mistral/OpenAI/Anthropic/Groq keys in Admin → Providers to switch models live, with no redeploy.',
  '- Troubleshooting: if chat fails check balance and plan gating; if Google sign-in says not configured, the owner needs to add the Google OAuth keys on the server; support email is ' + SUPPORT_EMAIL + '.',
  '',
  'GUARDRAILS:',
  '- Never reveal or discuss server configuration, environment variables, database details, or any API keys. Decline politely and offer help with the platform instead.',
  '- Never discuss other users, their chats, or admin-only data. /admin is the owner area — direct non-owner questions to ' + SUPPORT_EMAIL + '.',
  '- If asked about anything unrelated to this platform, say so briefly and steer back to plans, tokens, the playground or billing.',
].join('\n');

export type Faq = { keywords: string[]; answer: string };

const paidPlans = PLAN_FACTS.filter((f) => !f.isFree);
const faqPlanLines = PLAN_FACTS.map((f) =>
  f.isFree
    ? `- **Free** ₹0 — ${formatTokens(f.dailyTokens)} tokens/day, ${formatTokens(f.monthlyTokens)}/month, free-tier models`
    : `- **${f.name}** ${formatInrRupees(f.priceMonthlyInrPaise)}/mo or ${formatInrRupees(
        f.priceYearlyInrPaise ?? 0,
      )}/yr (10% off) — ${formatTokens(f.dailyTokens)} tokens/day, ${formatTokens(f.monthlyTokens)}/month, ${f.requestsPerMin} req/min`,
).join('\n');

const TOP_TOKEN_PLAN = paidPlans[0];

export const FAQ: Faq[] = [
  {
    keywords: ['plan', 'price', 'pricing', 'cost', '₹', 'inr', 'rupee', 'pro', 'business', 'free', 'upgrade', 'yearly', 'monthly', 'discount'],
    answer: `**Plans on IamHujju** (paid in INR via Razorpay):\n${faqPlanLines}\n\nUpgrade anytime at **/billing** — your plan and token grant activate the moment payment succeeds.`,
  },
  {
    keywords: ['token', 'balance', 'credit', 'deduct', 'metering', 'grant', 'exhausted', 'limit'],
    answer: `Tokens are the currency here — every message consumes them (prompt + completion). You get a free daily grant that refills at UTC midnight. Your live balance is shown in the playground header and on **/dashboard**. Run out? Upgrade at **/billing** for a much larger grant.`,
  },
  {
    keywords: ['signup', 'sign up', 'register', 'create account', 'login', 'log in', 'sign in', 'google', 'password'],
    answer: `You can create an account at **/signup** with email/password, or tap **Sign up with Google** for one-click access. Already registered? **/login** is the place. If Google sign-in shows "not configured", the site owner still needs to add the Google keys on the server.`,
  },
  {
    keywords: ['playground', 'chat', 'model', 'conversation', 'history', 'streaming'],
    answer: `The **/playground** is where you chat: pick a model in the header, type, and responses stream in live. Conversations are saved in the sidebar so you can continue them anytime. Which models you can use depends on your plan — paid plans unlock everything the owner has enabled.`,
  },
  {
    keywords: ['api', 'key', 'programmatic', 'sdk', 'endpoint', 'completions', 'curl'],
    answer: `On a paid plan you can create API keys at **/keys**, then call **POST /api/v1/chat/completions** with the header \`Authorization: Bearer <your-key>\` and an OpenAI-style body \`{ "model": "...", "messages": [...] }\`. Usage shows up on your dashboard.`,
  },
  {
    keywords: ['csv', 'export', 'usage record', 'download', 'analytics', 'report'],
    answer: `On any paid plan, a **⬇ Export CSV** button appears on **/dashboard** — it downloads your last 1,000 usage records (model, tokens, cost, status, latency) for your own analysis.`,
  },
  {
    keywords: ['payment', 'pay', 'razorpay', 'upi', 'card', 'netbanking', 'refund', 'receipt', 'billing'],
    answer: `Payments run through **Razorpay** (UPI, cards, netbanking) on **/billing**. Pick a plan and interval, pay, and your plan + tokens activate instantly with an emailed receipt. Payment issue? Contact ${SUPPORT_EMAIL} with your order ID.`,
  },
  {
    keywords: ['privacy', 'terms', 'legal', 'data', 'policy'],
    answer: `Our **[Privacy Policy](/privacy)** and **[Terms & Conditions](/terms)** cover how your data is handled. Short version: we store your email and usage records, never sell data, and chat content goes only to the AI provider processing your message.`,
  },
  {
    keywords: ['mock', 'provider', 'mistral', 'openai', 'anthropic', 'groq', 'gateway', 'model enable'],
    answer: `The platform runs on a provider-agnostic gateway: out of the box you get mock models for testing, and the owner can paste a real Mistral/OpenAI/Anthropic/Groq key in **Admin → Providers** to make those models live instantly — no code changes, no redeploy.`,
  },
  {
    keywords: ['support', 'contact', 'help', 'email', 'problem', 'bug', 'issue', 'broken', 'error'],
    answer: `Need a human? Email **${SUPPORT_EMAIL}** and you will hear back quickly. For instant answers about settings, billing or features, just ask me here.`,
  },
];

const FALLBACK_ANSWER = [
  `I'm ${ASSISTANT_NAME}, your IamHujju assistant. I can help with:`,
  '',
  '- **Plans & pricing** — what Free/Pro/Business include',
  '- **Tokens** — how balances and daily grants work',
  '- **Playground** — chatting, models and history',
  '- **API keys** — programmatic access on paid plans',
  '- **Billing** — Razorpay, receipts and upgrades',
  '',
  `Try asking "What can I do for free?" or "How do upgrades work?" — or email ${SUPPORT_EMAIL}.`,
].join('\n');

export function faqAnswer(question: string): string {
  const q = question.toLowerCase();
  let best: { score: number; answer: string } | null = null;
  for (const f of FAQ) {
    const score = f.keywords.reduce((n, k) => (q.includes(k) ? n + k.length : n), 0);
    if (score > 0 && (!best || score > best.score)) best = { score, answer: f.answer };
  }
  return best ? best.answer : FALLBACK_ANSWER;
}

/** Kept for potential future prompt budgets — top paid plan token grant. */
export const TOP_PAID_DAILY_TOKENS = TOP_TOKEN_PLAN.dailyTokens;
