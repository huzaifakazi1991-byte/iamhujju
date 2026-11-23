# Ratnagiri_Enterprenuers — iamhujju platform

A production AI SaaS platform (Le Chat / mistral.ai style) living at
**[iamhujju.com](https://iamhujju.com)** and served by Render at
`https://iamhujju-platform.onrender.com`. Users sign in, chat with real AI
models, generate images, and pay for GPU-time via an INR token system — while
the owner administers everything (providers, models, plans, users, pricing)
from a built-in admin panel, **without code changes or redeploys**.

> Detailed platform internals live in [`platform/README.md`](platform/README.md).
> The pre-platform legacy FreeLLMAPI workspace notes are archived at
> [`docs/legacy-freellmapi-workspace.md`](docs/legacy-freellmapi-workspace.md).

---

## 1. What this project is

| | |
|---|---|
| **Product** | Multi-provider AI gateway + chat playground + billing + admin |
| **Stack** | Next.js 15 (App Router, TypeScript strict) · Prisma 6 + PostgreSQL · Tailwind v4 · framer-motion · zod · jose (JWT cookies) |
| **Database** | Neon PostgreSQL (free tier) |
| **Hosting** | Render free web service (`platform/` root dir, blueprint in `render.yaml`) |
| **Payments** | Razorpay (INR: UPI/cards/netbanking) · Stripe optional (mock checkout when unset) |
| **Auth** | Email+password (bcrypt hashes, HttpOnly JWT cookies) + "Continue with Google" OAuth |
| **Live status** | `GET /api/health` → `{"status":"ok","db":"up"}` |

### Core features

- **Provider-agnostic AI gateway** — the owner pastes any provider API key in
  the admin panel (13 ready-to-configure providers with prefilled base URLs).
  Keys are **AES-256-GCM encrypted at rest**, never leave the server, and that
  provider's models go live **instantly** — no redeploy. Saving a key
  auto-syncs its model list and runs a live connection test (✅ live / ❌
  failing pill, with error classification for expired vs retired keys).
- **Capability catalog** — every model carries a capability (`chat`, `image`,
  `video`, `tts`); the playground exposes 💬 / 🖼 / 🎬 mode tabs with
  Create-image / Create-video quick actions and `?mode=` deep links.
- **Server-side gating on every request** — no request reaches a model without
  passing all checks: authenticated & not suspended → plan resolved server-side
  → per-minute rate limit (requests + tokens) → daily/monthly token caps →
  sufficient balance. Tokens are reserved atomically before streaming and
  settled with real usage afterward (aborted streams are still billed for what
  was consumed). Every mutation lands in an append-only `TokenLedger` audit.
- **Metered flat fees** — image renders cost 1,000 tokens, video 8,000 (plus
  prompt tokens); settled atomically after the render.
- **Billing (INR)** — Pro **₹1,299/mo**, Business **₹8,999/mo**, ~10% yearly
  discount (₹14,029/yr, ₹97,189/yr), pay-as-you-go token top-ups from ₹499.
  Razorpay webhook is replay-safe and idempotent.
- **Admin panel** (`/admin`) — providers, models (per-model pricing, tier,
  context window, live status/load), plans, users (grant tokens, suspend,
  audit trail), platform settings.
- **In-app messenger** — direct support chat with the owner + community group
  chat with live online indicators; huzaifa.ai floating assistant with
  carrom-striker flick physics and a full mobile experience (drawer, back
  buttons, touch-outside-to-close).

---

## 2. Repository map

```
.
├── platform/                 # ⭐ the real product (Next.js app)
│   ├── src/app/              # routes: playground, messages, pricing, billing,
│   │                         #   settings, profiles, /admin, api/*
│   ├── src/components/       # chat-client, nav, huzaifa-ai, gallery, ui/…
│   ├── src/lib/gateway/      # preflight → stream → settle pipeline, health
│   ├── prisma/               # schema + migrations + seed (plans, admin, mocks)
│   └── tests/                # vitest units + e2e-smoke.mjs + adversarial-stress.mjs
├── docs/
│   └── legacy-freellmapi-workspace.md  # archived pre-platform README
├── render.yaml               # Render blueprint (rootDir: platform, free plan)
├── server.js, src/, …        # legacy Express workspace (kept, not deployed)
└── README.md                 # this file
```

---

## 3. Run it locally (procedure)

Requires **Node.js 20.19+** and any PostgreSQL (Neon works fine).

```bash
cd platform
npm ci
cp .env.example .env         # then fill the values (table below)
npx prisma migrate deploy    # create schema
npm run db:seed              # admin user + Free/Pro/Business plans + mock models
npm run dev                  # http://localhost:3000
```

The seed admin comes from `ADMIN_EMAIL` / `ADMIN_PASSWORD`
(defaults `admin@example.com` / `change-me-immediately` — change immediately).
The `mock-chat` / `mock-image` / `mock-video` models let every flow work before
any real provider key is added.

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string (Neon pooled URL preferred) |
| `JWT_SECRET` | ✅ | Signs access/refresh cookies — `openssl rand -hex 32` |
| `APP_URL` | ✅ | Public origin, e.g. `https://iamhujju.com` (no trailing slash) |
| `KEY_ENCRYPTION_SECRET` | ✅ | AES-256-GCM secret for provider keys — stable; losing it makes stored keys unusable |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | ✅ | Read by the seed script |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | optional | Enables Continue-with-Google |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` | optional | Live INR checkout in production |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | optional | Stripe billing (mock checkout when unset) |
| `REDIS_URL` | optional | Shared rate limiting across instances (in-memory fallback) |
| `SMTP_URL` | optional | Email verification + receipts |

Never commit `.env` or any secret.

---

## 4. Deploy to Render (procedure)

The blueprint `render.yaml` defines a free-tier node web service with
`rootDir: platform`, build `npm ci && npx prisma generate && npm run build`,
start `bash scripts/deploy-start.sh` (runs `prisma migrate deploy` then
`next start`), and health check `/api/health`.

1. **Neon** — create a project, copy the pooled connection string.
2. **Render** — New → Blueprint (or re-sync your existing service), set the
   `sync: false` secrets in the dashboard: `DATABASE_URL`, `ADMIN_EMAIL`,
   `ADMIN_PASSWORD`, payment + Google keys. `JWT_SECRET` /
   `KEY_ENCRYPTION_SECRET` are auto-generated on first sync.
3. **Deploy** — Render builds on every push to `main`. Verify
   `https://iamhujju-platform.onrender.com/api/health`.
4. **Custom domain** — Cloudflare DNS: CNAME apex → the Render hostname;
   proxy through Cloudflare with a rule 301ing `www.iamhujju.com` → apex.
5. **Google OAuth** — create an OAuth web client in Google Cloud; authorized
   redirect URI must be exactly `https://iamhujju.com/api/auth/google/callback`;
   set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APP_URL` on Render. Check
   `https://iamhujju.com/api/auth/google/status` → `{"configured":true}`.
6. **Razorpay** — add key id/secret + webhook secret (webhook URL
   `https://iamhujju.com/api/billing/webhook/razorpay`) to enable live INR
   payments; unset keys fall back to mock checkout.

---

## 5. Daily admin operations (guidance)

All of this happens at `/admin` after seeding — no deploys required:

- **Add a provider** — Admin → Providers → paste the API key → Save. Models
  auto-sync (capability auto-detected from ids), a live test runs, and the
  health pill appears. Use **Connection test** if the pill disagrees with
  reality; the tester probes up to 3 models and classifies errors
  (bad key vs retired model vs provider outage).
- **Tune models** — per-model edit: context window, max output, tier gate
  (`free`/`pro`/`business`), price multiplier, display order, visibility. The
  **Status & load** column shows 24h requests, error %, latency and provider
  health, auto-refreshing every 20s.
- **Plans & pricing** — edit token grants, rate limits, INR/USD prices.
- **Users** — search, grant/adjust token balances, suspend/terminate; every
  action is auditable. Admin can also read user chat threads from the admin
  console and answer them directly in the messenger.
- **Embed keys rotation** — rotating `KEY_ENCRYPTION_SECRET` invalidates
  stored provider keys; re-enter keys after an intended rotation.

---

## 6. Testing (procedure)

```bash
cd platform
npm test                  # vitest units (crypto, tokens, rate-limit, health, …)
npx tsc --noEmit          # typecheck
npm run build             # production build
```

Full-flow e2e (needs a running server on :3100):

```bash
npx prisma migrate deploy && npm run db:seed
npm run build && npm run start
E2E_BASE=http://localhost:3100 node tests/e2e-smoke.mjs         # expect ALL-PASS
E2E_BASE=http://localhost:3100 node tests/adversarial-stress.mjs # expect ADV-ALL-PASS
```

---

## 7. Contribution workflow

- Feature work goes on `vibe/<slug>-507ca0` branches, delivered as **draft PRs**.
- CI: `.github/workflows/platform-ci.yml` (typecheck + tests + build,
  triggered on `platform/**` changes).
- Merge policy: **"Create a merge commit"** button — keep merge commits, no
  squash/rebase merges.
- Production is whichever commit `main` points at; Render redeploys on push
  to `main`.
