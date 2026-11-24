# Legacy FreeLLMAPI workspace (superseded)

> **This is the original pre-platform workspace README, kept for reference.**
> The product described by the up-to-date documentation is the Next.js AI SaaS
> platform in [`platform/`](../platform/) — see the
> [root README](../README.md) for current project information, procedures, and
> guidance. The legacy Express app in this workspace root is no longer part of
> the deployed production stack.

---

# iamhujju — legacy FreeLLMAPI workspace

iamhujju is a local React/Vite workspace and Express API for a running
FreeLLMAPI gateway. The browser talks only to the local Express API. Accounts,
sessions, provider credentials, and saved conversations are stored in the
configured Neon PostgreSQL database; the database URL and provider keys stay
server-side.

## Requirements

- Node.js 20.19+
- A Neon PostgreSQL database
- A running FreeLLMAPI gateway and a gateway API key

## Configure and run

Copy `.env.example` to `.env` and set the values locally:

```env
DATABASE_URL=your-Neon-PostgreSQL-connection-URL
FREELLMAPI_BASE_URL=http://127.0.0.1:31415/v1
FREELLMAPI_KEY=your-local-gateway-key
API_KEY_ENCRYPTION_SECRET=your-random-secret-at-least-32-bytes
# Set only when a one-time migration needs to decrypt older stored keys.
# LEGACY_API_KEY_ENCRYPTION_SECRET=
# Shared server-key chat access is disabled unless explicitly enabled.
# ALLOW_SHARED_FREELLMAPI_KEY=true
# For a deployed frontend, set its exact origin.
# APP_ORIGIN=https://iamhujju.com
```

Keep `.env` out of source control. `DATABASE_URL` is used only by the Express
server; never prefix it with `VITE_` or expose it to frontend code. Use a Neon
pooled connection URL. The server requires verified TLS and fails closed if
`DATABASE_URL` is absent or invalid. Set a stable random
`API_KEY_ENCRYPTION_SECRET` of at least 32 bytes; changing or losing it makes
stored provider keys unusable.

Install dependencies and start both the API proxy and Vite:

```sh
npm install
npm run dev
```

The Express API binds to `127.0.0.1:3001` by default; Vite proxies `/api`
requests to it. The API remains loopback-bound in local development even
though its database is hosted by Neon. Set `NODE_ENV=production` to bind to
`0.0.0.0` for cloud deployments, or override the interface explicitly with
the `HOST` environment variable (e.g. `HOST=0.0.0.0 npm start`). Do not
expose it to an untrusted network without a separate deployment and
identity/security review.

## Existing local account migration

The migration command defaults to a read-only dry run:

```sh
npm run migrate:neon -- --dry-run
```

Review the account, active-session, and credential counts. To apply, first make
sure the Neon database is the intended target and that you have a separate
Neon backup. Then run:

```sh
npm run migrate:neon -- --apply
```

On apply, the tool creates a timestamped backup of `.data/auth-store.json`,
validates the source, and imports accounts, unexpired hashed sessions, and
encrypted provider credentials in one PostgreSQL transaction. It records an
idempotency marker and never deletes or rewrites the original JSON file. If
older credentials were encrypted with a different secret, configure
`LEGACY_API_KEY_ENCRYPTION_SECRET` for this one-time operation; the migration
never derives encryption from `FREELLMAPI_KEY`. Keep the backup until the
migrated accounts and keys have been checked. Use Neon backups/PITR for ongoing
database recovery.

Older conversations in browser storage are not sent to the server
automatically when they are not tied to an account. After signing in, use
**Import older browser chats to this account** to choose an account for those
unassigned conversations. Account-partitioned browser conversations are
imported into that same account on successful sign-in. Browser copies are
removed only after the server confirms the import; malformed or failed imports
remain untouched. The database migration does not read browser storage.

## Authentication and data handling

- Sign-up and login use salted scrypt password hashes. Session tokens are
  delivered only in an `HttpOnly`, `SameSite=Strict` cookie; only token hashes
  are stored in PostgreSQL.
- Provider keys are encrypted with AES-256-GCM before being stored in
  `provider_credentials`. They are never returned to the browser. The
  encryption secret is independent of the shared gateway key.
- Saved conversations are stored in Neon under the authenticated account and
  are retrieved or changed only through owner-scoped API routes. Conversation
  message content is not end-to-end encrypted by this app and is available to
  the application server and database provider; do not save credentials or
  other secrets in chat text.
- The browser uses local storage only to safely import pre-existing
  conversations. New and updated conversations are saved through the
  authenticated API.

## Chat and model API

- `GET /api/models` retrieves FreeLLMAPI's
  `/v1/models?available=true` catalog. When an authenticated account has an
  OpenRouter connection, it also retrieves that key's accessible catalog.
- `POST /api/chat/completions` validates the model and conversation, then
  forwards the request to the selected provider. SSE responses are streamed
  through to the browser, and stopping generation aborts the upstream request.
- Chat requests use the signed-in user's own FreeLLMAPI key by default. The
  server's `FREELLMAPI_KEY` is not used for account chat unless
  `ALLOW_SHARED_FREELLMAPI_KEY=true` is explicitly set. Keep this option unset
  for shared or publicly reachable deployments.
- The API validates request bodies, caps JSON payloads at 1 MB, and
  rate-limits account, chat, model-refresh, credential, and conversation
  endpoints. Rate limits use in-memory storage and are intended for this
  loopback-bound single-process app; a multi-instance deployment needs a
  shared rate-limit store.
- API responses and the Vite development/preview server send restrictive
  security headers, including CSP and frame denial. Cross-origin API requests
  are rejected. Set `APP_ORIGIN` to the exact frontend origin before deploying
  behind a reverse proxy.

## Models and skills

The Models screen browses the live gateway catalog with search, provider and
availability filters, context-window filtering, sorting, and pagination.
Filters use only metadata returned by the gateway; fields it does not provide
are not fabricated.

The Skills screen browses the 451 skill metadata records from the supplied
`NVIDIA/skills` archive. The static catalog includes category, product,
subdomain, audience, and activity fields for local search and filtering; it
does not download or execute skill contents. Use a card's Copy command action
to copy the documented `npx skills add` command, then review and run it
yourself in a terminal. The metadata is attributed to
[NVIDIA/skills](https://github.com/NVIDIA/skills) and is distributed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

## Checks

```sh
npm test
npm run lint
npm run build
```

The regular suite uses an isolated PostgreSQL-compatible in-memory database.
For a real Neon connection check, create a disposable Neon test branch and set
`DATABASE_TEST_URL` in the process environment (never point it at production):

```sh
npm run test:database
```

## Prisma data layer (foundation)

The target data model for upcoming milestones lives in [`prisma/schema.prisma`](prisma/schema.prisma)
(PostgreSQL). The existing raw-`pg` layer keeps running unchanged; adoption happens per milestone.

- `npm run prisma:generate` — generate the Prisma client
- `npm run db:migrate:dev` — create/apply migrations during development
- `npm run db:migrate:deploy` — apply committed migrations (CI/production)

A baseline migration is committed at `prisma/migrations/20261121120000_init/migration.sql`.
It has **not** been applied to the live database yet; apply it only when a milestone
switches to Prisma, using `DATABASE_URL` for the target database.
