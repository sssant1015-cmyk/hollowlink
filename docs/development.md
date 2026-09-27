# Development Guide

## Prerequisites

- Node.js ≥ 20 (built and tested on Node 24 — uses the built-in `node:sqlite`)
- npm ≥ 10

## Setup

```bash
npm install                 # installs both workspaces
cp .env.example .env        # then edit .env — set JWT_SECRET!
npm run migrate             # create + migrate database/hollowlink.db
npm run seed                # (optional) demo data
npm run dev                 # API on :8787 + Vite on :5173, proxied
```

Generate a strong secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Demo logins after seeding: `neo`, `trinity`, `morpheus`, `mouse`, `tank`, `cypher` —
password `hollowlink-demo` for all.

## Daily commands

| Command | What it does |
| --- | --- |
| `npm run dev` | API + web dev servers concurrently |
| `npm run dev:api` / `npm run dev:web` | one side only |
| `npm run typecheck` | strict TS across both packages |
| `npm test` / `npm run test:api` / `npm run test:web` | vitest runs |
| `npm run build` | typecheck + production build |
| `npm run migrate` / `npm run seed` | DB lifecycle |

## Testing layout

- `backend/tests/helpers.ts` boots the real Express app against a throwaway SQLite file per
  suite (no mocks for the data layer) and provides `registerUser()` fixtures with cookie jars.
- Suites: `auth.test.ts`, `friends.test.ts`, `groups.test.ts`, `chat.security.test.ts`
  (chat + events + feed + reports + authorization basics).
- Frontend tests run in jsdom with a stubbed `fetch` (see `frontend/tests/setup.ts`).

## Adding a feature (convention)

1. **Migration** (if schema changes): add `backend/src/db/migrations/NNNN_*.ts`, register it in
   `migrate.ts` (`MIGRATIONS` array), and document the table in `docs/database.md`.
2. **Service**: business logic + authorization in `src/services/*.service.ts`. Throw
   `ApiError.*` for failures. Never touch `req`/`res` here.
3. **Route**: thin handler in `src/routes/*.routes.ts` — validate with zod, call the service,
   respond via `ok()`/`created()`. Mount in `src/index.ts`.
4. **Tests**: cover the happy path **and** at least one authorization boundary (who *can't* do
   this?).
5. **Frontend**: typed calls through `src/api/client.ts` (`api.get/post/…`), shared types in
   `src/types/api.ts`, UI primitives from `components/ui/Ui.tsx`, styling via the existing
   design-system classes in `styles/global.css` before adding new ones.

## Gotchas

- **`node:sqlite` named params:** a statement errors if you pass named params it doesn't use —
  COUNT queries get only their own params (see `homeFeed()` in `feed.service.ts` for the
  pattern).
- **Transactions:** use the `transaction(() => { … })` helper from `lib/crypto.ts`; it wraps
  `BEGIN IMMEDIATE` with rollback-on-throw.
- **The machine's global `PORT=0`:** `config/env.ts` treats it as unset (defaults to 8787) —
  some Windows shells export it.
- **Rate limits in tests:** skipped when `NODE_ENV=test`; keep it that way or fixture creation
  will trip the auth limiter.
- **Windows:** paths in config are resolved from the backend root; forward and back slashes
  both work.

## Code quality bar (pre-push checklist)

1. `npm run typecheck` — zero errors
2. `npm test` — all suites green
3. `npm run build` — both packages build
4. No `console.log` debugging in committed code
5. No secrets — `.env` is gitignored; only `.env.example` is tracked
