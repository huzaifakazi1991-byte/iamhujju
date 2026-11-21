import { prisma } from '@/lib/db';
import { decryptSecret } from '@/lib/crypto';
import { adapterForProvider } from '@/lib/gateway/registry';
import { messageText, type ChatMessage } from '@/lib/gateway/types';

export const ASSISTANT_NAME = 'huzaifa.ai';

export const ASSISTANT_SYSTEM_PROMPT = [
  `You are ${ASSISTANT_NAME}, the warm, concise support assistant for IamHujju (https://iamhujju.com) — an AI playground SaaS by Huzaifa Kazi.`,
  'Answer questions about this platform: accounts, plans, pricing, tokens, the playground, billing, API keys and troubleshooting. Keep replies under 120 words, friendly and practical, using short markdown bullets when helpful.',
  '',
  'PLATFORM KNOWLEDGE:',
  '- Pages: / (home), /pricing, /signup, /login, /playground (chat with models + conversation history), /dashboard (usage + balance + CSV export), /billing (upgrade + receipts), /keys (API keys for programmatic access), /settings, /admin (owner only), /privacy, /terms.',
  '- Plans (paid in INR via Razorpay): Free ₹0 — 10,000 tokens/day, 100,000/month, free-tier models; Pro ₹1,299/month (₹14,029/year, 10% off) — 200,000 tokens/day, 4M/month, all enabled models, 60 req/min, API keys, CSV export; Business ₹8,999/month (₹97,189/year) — 2M tokens/day, 40M/month, 300 req/min.',
  '- Tokens: every message consumes tokens from your balance; a daily grant refills at UTC midnight; live balance shown in the playground header and /dashboard.',
  '- Payments: Razorpay Checkout (UPI, cards, netbanking) on /billing; upgrades and token grants are automatic, and a receipt is emailed. Google sign-in is on /login and /signup.',
  '- API keys: create at /keys and call POST /api/v1/chat/completions with "Authorization: Bearer <key>"; requires a paid plan.',
  '- Mock mode: without provider keys the site ships with mock models (mock-small, mock-large) so everything is testable. The owner can paste real Mistral/OpenAI/Anthropic/Groq keys in Admin → Providers to switch models live, with no redeploy.',
  '- Troubleshooting: if chat fails check balance and plan gating; if Google sign-in says not configured, the owner must set GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET; support email is huzaifakazi1991@gmail.com.',
].join('\n');

type Faq = { keywords: string[]; answer: string };

const FAQ: Faq[] = [
  {
    keywords: ['plan', 'price', 'pricing', 'cost', '₹', 'inr', 'rupee', 'pro', 'business', 'free', 'upgrade', 'yearly', 'monthly', 'discount'],
    answer: '**Plans on IamHujju** (paid in INR via Razorpay):\n- **Free** ₹0 — 10,000 tokens/day, 100,000/month, free-tier models\n- **Pro** ₹1,299/mo or ₹14,029/yr (10% off) — 200,000 tokens/day, 4M/month, all enabled models, API keys + CSV export\n- **Business** ₹8,999/mo or ₹97,189/yr — 2M tokens/day, 40M/month, 300 req/min\n\nUpgrade anytime at **/billing** — your plan and token grant activate the moment payment succeeds.',
  },
  {
    keywords: ['token', 'balance', 'credit', 'deduct', 'metering', 'grant', 'exhausted', 'limit'],
    answer: 'Tokens are the currency here — every message consumes them (prompt + completion). You get a free daily grant that refills at UTC midnight. Your live balance is shown in the playground header and on **/dashboard**. Run out? Upgrade at **/billing** for a much larger grant.',
  },
  {
    keywords: ['signup', 'sign up', 'register', 'create account', 'login', 'log in', 'sign in', 'google', 'password'],
    answer: 'You can create an account at **/signup** with email/password, or tap **Sign up with Google** for one-click access. Already registered? **/login** is the place. If Google sign-in shows "not configured", the site owner still needs to add the Google keys on the server.',
  },
  {
    keywords: ['playground', 'chat', 'model', 'conversation', 'history', 'streaming'],
    answer: 'The **/playground** is where you chat: pick a model in the header, type, and responses stream in live. Conversations are saved in the sidebar so you can continue them anytime. Which models you can use depends on your plan — paid plans unlock everything the owner has enabled.',
  },
  {
    keywords: ['api', 'key', 'programmatic', 'sdk', 'endpoint', 'completions', 'curl'],
    answer: 'On a paid plan you can create API keys at **/keys**, then call **POST /api/v1/chat/completions** with the header `Authorization: Bearer <your-key>` and an OpenAI-style body `{ "model": "...", "messages": [...] }`. Usage shows up on your dashboard.',
  },
  {
    keywords: ['csv', 'export', 'usage record', 'download', 'analytics', 'report'],
    answer: 'On any paid plan, a **⬇ Export CSV** button appears on **/dashboard** — it downloads your last 1,000 usage records (model, tokens, cost, status, latency) for your own analysis.',
  },
  {
    keywords: ['payment', 'pay', 'razorpay', 'upi', 'card', 'netbanking', 'refund', 'receipt', 'billing'],
    answer: 'Payments run through **Razorpay** (UPI, cards, netbanking) on **/billing**. Pick a plan and interval, pay, and your plan + tokens activate instantly with an emailed receipt. Payment issue? Contact huzaifakazi1991@gmail.com with your order ID.',
  },
  {
    keywords: ['privacy', 'terms', 'legal', 'data', 'policy'],
    answer: 'Our **[Privacy Policy](/privacy)** and **[Terms & Conditions](/terms)** cover how your data is handled. Short version: we store your email and usage records, never sell data, and chat content goes only to the AI provider processing your message.',
  },
  {
    keywords: ['mock', 'provider', 'mistral', 'openai', 'anthropic', 'groq', 'gateway', 'model enable'],
    answer: 'The platform runs on a provider-agnostic gateway: out of the box you get mock models for testing, and the owner can paste a real Mistral/OpenAI/Anthropic/Groq key in **Admin → Providers** to make those models live instantly — no code changes, no redeploy.',
  },
  {
    keywords: ['support', 'contact', 'help', 'email', 'problem', 'bug', 'issue', 'broken', 'error'],
    answer: 'Need a human? Email **huzaifakazi1991@gmail.com** and you will hear back quickly. For instant answers about settings, billing or features, just ask me here.',
  },
];

function faqAnswer(question: string): string {
  const q = question.toLowerCase();
  let best: { score: number; answer: string } | null = null;
  for (const f of FAQ) {
    const score = f.keywords.reduce((n, k) => (q.includes(k) ? n + k.length : n), 0);
    if (score > 0 && (!best || score > best.score)) best = { score, answer: f.answer };
  }
  if (best) return best.answer;
  return [
    `I'm ${ASSISTANT_NAME}, your IamHujju assistant. I can help with:`,
    '',
    '- **Plans & pricing** — what Free/Pro/Business include',
    '- **Tokens** — how balances and daily grants work',
    '- **Playground** — chatting, models and history',
    '- **API keys** — programmatic access on paid plans',
    '- **Billing** — Razorpay, receipts and upgrades',
    '',
    'Try asking "What can I do for free?" or "How do upgrades work?"',
  ].join('\n');
}

export async function assistantAnswer(history: ChatMessage[]): Promise<{ answer: string; source: 'llm' | 'faq' }> {
  const provider = await prisma.provider.findFirst({
    where: { enabled: true, encryptedKey: { not: null } },
    include: { models: { where: { adminEnabled: true }, orderBy: { displayOrder: 'asc' }, take: 1 } },
  });
  if (provider && provider.models.length > 0) {
    try {
      const adapter = adapterForProvider(provider.name);
      const credential = decryptSecret(provider.encryptedKey!);
      const messages: ChatMessage[] = [{ role: 'system', content: ASSISTANT_SYSTEM_PROMPT }, ...history.slice(-10)];
      let answer = '';
      for await (const event of adapter.streamChat({ model: provider.models[0].slug, messages, maxTokens: 400, temperature: 0.4 }, credential)) {
        if (event.type === 'delta') answer += event.text;
        if (event.type === 'error') throw new Error(event.message);
      }
      if (answer.trim()) return { answer: answer.trim(), source: 'llm' };
    } catch {
      // fall through to the built-in knowledge base
    }
  }
  const last = [...history].reverse().find((m) => m.role === 'user');
  return { answer: faqAnswer(last ? messageText(last.content) : ''), source: 'faq' };
}
