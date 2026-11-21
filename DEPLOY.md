# Deploying IamHujju to https://iamhujju.com (Render)

The production app is the Next.js platform in [`platform/`](platform/README.md). Every push to `main` can auto-deploy via Render.

## 1. Database (one-time)

Use your existing Neon project or create one at https://neon.tech (free tier is fine to start):

1. Create a project, choose the region closest to `oregon`.
2. Copy the pooled connection string (starts with `postgresql://...neon.tech/...?sslmode=require`).
3. The platform migrations are applied automatically on every deploy start (`prisma migrate deploy` in the start command).

## 2. Create the Render web service (one-time)

Option A — Blueprint (recommended, uses [`render.yaml`](render.yaml)):

1. Render dashboard -> **New -> Blueprint** -> pick this repository.
2. Render reads `render.yaml` and fills in every field (root dir `platform`, build/start, health check).
3. Fill in the env vars it flags (`DATABASE_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`). `JWT_SECRET` and `KEY_ENCRYPTION_SECRET` are generated for you.
4. **Apply** - the first deploy runs migrations and boots the app.

Option B - Manual web service, exact settings if you prefer the dashboard:

| Field | Value |
|---|---|
| Runtime | Node |
| Root Directory | `platform` |
| Build Command | `npm ci && npx prisma generate && npm run build` |
| Start Command | `npx prisma migrate deploy && npm run start` |
| Health Check Path | `/api/health` |
| Node version | 22 |

Add env vars:
- `DATABASE_URL` - the Neon string from step 1
- `JWT_SECRET` - `openssl rand -hex 32`
- `KEY_ENCRYPTION_SECRET` - `openssl rand -hex 32` (encrypts provider API keys; changing it later invalidates stored keys, so save it somewhere safe)
- `APP_URL` - `https://iamhujju.com`
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` - read by the seed script
- Optional: `REDIS_URL` (Upstash) for shared rate limiting, `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`, `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, `SMTP_URL` (e.g. Resend SMTP)

## 3. Seed plans, models & the admin user (automatic)

No Shell needed — the blueprint's start command runs `npm run db:seed` on every boot. It is idempotent (safe upserts) and never resets an existing admin's password.

Seeded content every boot: Free / Pro / Business plans, two mock models (free + paid tier), and your admin user from `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

Prefer to seed manually instead? From your own machine (Render free plan blocks Shell):

```bash
DATABASE_URL="postgresql://...neon.tech/...?sslmode=require" \
ADMIN_EMAIL="you@example.com" ADMIN_PASSWORD="your-strong-password" \
npx tsx prisma/seed.ts   # from inside platform/ after npm ci
```

## 4. Point the domain

Render service -> **Settings -> Custom Domains** -> add:
- `iamhujju.com`
- `www.iamhujju.com`

Update DNS at your registrar (as Render instructs):
- Apex `iamhujju.com` -> external redirect or ANAMES at your registrar, or use ALIAS
- `www` -> CNAME to your Render service URL

[DNS guidance](https://render.com/docs/custom-domains). HTTPS is provisioned automatically. Keep the domain customization on this new platform service and remove it from any legacy service at the same time you cut over.

## 5. Enable real AI providers (any time, no redeploy)

1. Sign in at `https://iamhujju.com/login` with the seeded admin account and **change the password immediately** (`/settings`).
2. Go to `/admin/providers`, pick a provider kind (Mistral, OpenAI, OpenAI-compatible, Anthropic), paste its API key, enable the models you want under `/admin/models`.
3. Keys are encrypted with `KEY_ENCRYPTION_SECRET` (AES-256-GCM) server-side and never leave the backend. Models appear to users instantly.

## 6. Stripe webhook (when you enable real payments)

1. Stripe -> Developers -> Webhooks -> endpoint: `https://iamhujju.com/api/billing/webhook`, event `checkout.session.completed`.
2. Copy the signing secret -> Render env `STRIPE_WEBHOOK_SECRET`.
3. Without Stripe keys, `/billing` runs the built-in mock checkout (upgrade flow works end-to-end for testing).

## 7. Enable Google Gemini models (free tier included, ~2 minutes)

1. Get a free API key at <https://aistudio.google.com/apikey> (free quota available; billing optional on Google's side).
2. Sign in as admin → **Admin → Providers** → the **gemini** provider is pre-created with its models seeded (Gemini 2.5 Flash-Lite and Flash for the Free tier, Gemini 2.5 Pro for Pro/Business tiers). Paste your **Gemini API key** and save — the provider goes live instantly; the key is AES-256-GCM encrypted and never leaves the server.
3. Every logged-in user can now chat with the free-tier Gemini models, metered against their plan's token balance and rate limits. Server-side gating (login + plan tier + balance + admin-enabled model) runs on every request, so nobody can bypass without login and payment.
4. Tune anything in **Admin → Models**: enable/disable, rename, set minimum tier (`free`/`pro`/`business`), reorder.
5. Pay-as-you-go: token top-up packs (Starter ₹499 / Booster ₹999 / Turbo ₹1,699) are available on **/billing** for any logged-in user; owners can also grant tokens per user in **Admin → Users**.

## 8. Razorpay payments (INR)

1. Sign up / sign in at <https://dashboard.razorpay.com> (test mode is free).
2. Copy the **Key Id** and **Key Secret** from Settings → API Keys.
3. Render service → Environment → set:
   - `RAZORPAY_KEY_ID` (e.g. `rzp_test_...`)
   - `RAZORPAY_KEY_SECRET`
   - `RAZORPAY_USD_TO_INR` (default `88`; only used as a fallback when a plan has no INR price)
4. The moment both keys are set, the billing page switches to real Razorpay Checkout (UPI, cards, netbanking) charging the exact INR prices stored on each plan (`priceMonthlyInrPaise` / `priceYearlyInrPaise`, seeded to: Pro ₹1,299/mo · ₹14,029/yr; Business ₹8,999/mo · ₹97,189/yr; yearly is 10% off the monthly price).
5. Recommended: Settings → Webhooks → add `https://iamhujju.com/api/billing/webhook/razorpay` with event **payment.captured**, then set `RAZORPAY_WEBHOOK_SECRET` on Render. The checkout already verifies HMAC signatures server-side and is idempotent — the webhook is a replay-safe backup.
6. Go live by toggling your account from test to live mode and swapping in live keys. Without any keys, mock checkout keeps the full upgrade flow testable.

## 9. Enable Google sign-in (optional, ~5 minutes)

1. Go to [Google Cloud Console](https://console.cloud.google.com) -> create (or pick) a project.
2. **APIs & Services -> OAuth consent screen** -> External -> fill app name (`IamHujju`) + your support email -> save. Add your own account as a test user while the app is in Testing mode.
3. **APIs & Services -> Credentials -> Create credentials -> OAuth client ID** -> Application type **Web application**:
   - Authorized redirect URI: `https://iamhujju.com/api/auth/google/callback`
4. Copy the **Client ID** and **Client secret** -> Render service -> Environment -> set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` -> save (service redeploys automatically).
5. "Continue with Google" on `/login` and `/signup` now works instantly — no code changes, no manual deploy. Until then, clicking it politely redirects back with a "not configured yet" message.

## 10. Verify the deployment

`GET https://iamhujju.com/api/health` must return `{"status":"ok","db":"up"}` — e.g. open it in a browser, or
`node -e "fetch('https://iamhujju.com/api/health').then(r=>r.json()).then(console.log)"`.

Full flow: sign up -> free tier auto-grants daily tokens -> chat in the playground -> token balance drops -> (mock) upgrade in billing -> admin panel -> paste a real provider key -> chat through the real model.

## Rollback

Render dashboard -> service -> **Events** -> pick the previous deploy -> **Rollback**.
