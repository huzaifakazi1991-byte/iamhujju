# iamhujju platform — AI SaaS (Le Chat-style playground)

Next.js 15 (App Router) + TypeScript + Prisma/PostgreSQL + Redis(optional) + Stripe + Google OAuth.

## Quick start (local)

```bash
cd platform
npm ci
cp ../.env.example .env   # or set env vars below
npx prisma migrate deploy
npm run db:seed
npm run build && npm run start   # http://localhost:3000
```

### Required environment

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (Neon, Supabase, local, etc.) |
| `JWT_SECRET` | Access/refresh token signing — set a long random string in prod |
| `KEY_ENCRYPTION_SECRET` | AES-256-GCM secret used to encrypt provider API keys at rest |
| `APP_URL` | Public base URL, e.g. `https://iamhujju.com` |
| `REDIS_URL` | Optional. Enables shared rate limiting across instances (falls back to in-memory) |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Optional. Enables Stripe Checkout + webhook billing |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Optional. Enables Razorpay Checkout (INR: UPI, cards, netbanking) |
| `RAZORPAY_WEBHOOK_SECRET` | Optional. Enables the `/api/billing/webhook/razorpay` replay-safe webhook |
| `RAZORPAY_USD_TO_INR` | Optional fallback conversion (default `88`) when a plan has no INR paise price |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Optional. Enables "Continue with Google" |
| `SMTP_URL` | Optional. Enables e-mail verification + receipts |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Read by the seed script |

## Admin setup

1. Seed creates an admin user (`ADMIN_EMAIL` / `ADMIN_PASSWORD`, default `admin@example.com` / `change-me-immediately`) plus the Free/Pro/Business plans and two mock models.
2. Sign in, open `/admin`:
   - **Providers** → paste any provider API key (Mistral, OpenAI, OpenAI-compatible, Anthropic, Groq). Keys are AES-256-GCM encrypted server-side and never leave the backend. The provider's models become available through the gateway immediately — no code changes, no redeploy.
   - **Models** → add/rename/reorder models, set context window, pricing multipliers and the minimum tier (`free`/`pro`/`business`), and toggle visibility.
   - **Plans** → edit prices, daily/monthly tokens, rate limits, and allowed model slugs.
   - **Users** → search, grant/adjust token balances, suspend accounts (full audit trail in `AdminAction`).
   - **Settings** → platform toggles (e.g. disable sign-ups).

## Gateway rules (enforced server-side on every request)

1. Authenticated user + not suspended (session cookie for UI, `Bearer` API key for `/api/v1/chat/completions`).
2. Plan resolved server-side (active subscription, otherwise Free tier).
3. Per-minute rate limit (requests + tokens) from the plan.
4. Daily + monthly token caps from the plan; free tier receives its `dailyTokens` grant automatically once per UTC day (append-only `TokenLedger` audit).
5. Sufficient token balance — tokens are reserved atomically before streaming and settled with real usage afterward (aborted streams are still billed for consumed tokens).

## Testing

```bash
npm test                     # vitest unit tests (crypto, tokens, rate-limit, validation)
npx tsc --noEmit             # typecheck
npm run build                # production build
E2E_BASE=http://localhost:3100 node tests/e2e-smoke.mjs   # full-flow smoke test against a running server
```

## Deployment

### Docker (any VPS)

```bash
docker build -t iamhujju-platform .
docker run -p 3000:3000 -e DATABASE_URL=... -e JWT_SECRET=... -e KEY_ENCRYPTION_SECRET=... iamhujju-platform
```

The container runs `prisma migrate deploy` before starting.

### Render / Vercel

- Render web service: root `render.yaml` exists for the legacy app; point a new service at `platform/` with build `npm ci && npm run build` and start `npm run start`.
- Set every environment variable above in the dashboard. `NEXTAUTH`-style standalone auth is built in — no extra service required.

### Health check

`GET /api/health` → `{ "status": "ok", "db": "up" }`.
