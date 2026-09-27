# HollowLink — Architecture

## High-level topology

```
┌──────────────────────┐        HTTPS / WSS          ┌──────────────────────────┐
│  React SPA (Vite)    │  ◀──── REST + Socket.IO ──▶  │  Node + Express API      │
│  frontend/           │                              │  backend/                │
│  - React 18          │   JWT in httpOnly cookie     │  - REST controllers      │
│  - React Router      │   (websocket auth via cookie │  - Socket.IO gateway     │
│  - Context + hooks   │    or auth token handshake)  │  - Service layer         │
│  - Code-split pages  │                              │  - SQLite (node:sqlite)  │
└──────────────────────┘                              └──────────────────────────┘
```

One process serves both the REST API (`/api/*`) and the WebSocket gateway (Socket.IO).
In production the built SPA (`frontend/dist`) can be served by any static host/CDN or by the
same reverse proxy that fronts the API.

## Backend layering

Request flow:

```
client → CORS/helmet → rate limiter → cookie parser → route → [auth] → [validation] → controller → service → SQLite
                                                      ↘ errors → central error handler → structured JSON
```

- **Routes** (`src/routes/*.routes.ts`) — thin controllers. Parse + validate input, call one
  service, shape the response envelope. No SQL here.
- **Services** (`src/services/*.service.ts`) — all business logic and authorization rules.
  Pure functions over the DB connection; fully unit/integration-testable.
- **DB** (`src/db/`) — `connection.ts` holds the singleton `node:sqlite` handle (WAL, FK on,
  busy timeout). `migrations/` contains ordered, transactional migrations; `migrate.ts` applies
  pending ones idempotently.
- **Middleware** — `auth.ts` (requireAuth/optionalAuth), `validate.ts` (zod body/query/params),
  `errors.ts` (single error funnel), `rateLimit.ts`, `upload.ts` (multer memory storage +
  magic-byte sniffing).
- **Socket gateway** (`src/socket/gateway.ts`) — authenticates each handshake (cookie or
  `auth.token`), joins `user:{id}` and `conversation:{id}` rooms, and re-uses the same chat
  service functions as REST so authorization can't drift between transports.

## Structured responses

Every JSON response uses one envelope:

```json
{ "success": true,  "data": { … }, "error": null }
{ "success": false, "data": null, "error": { "code": "FORBIDDEN", "message": "…" } }
```

Unexpected exceptions are logged server-side; clients only ever see `INTERNAL_ERROR` with a
generic message (in non-production the message is passed through for debuggability).

## Real-time design

- Presence: in-memory registry (`services/presence.ts`) — online while ≥1 socket is connected,
  away after 5 idle minutes (swept every 60s), persisted to `users.status` for cross-restart display.
- Chat: rooms per conversation; message fan-out to room members; per-user `chat:notify` events
  for offline catch-up; typing + read-state events are room-scoped.
- All socket handlers wrap service calls in try/catch and emit `error:api` with the same error
  codes as REST.

## Design decisions worth knowing

1. **`node:sqlite` over better-sqlite3.** Node 24 ships a stable built-in SQLite module. That
   removes the native-module build step entirely (no Visual Studio toolchain required on
   Windows). API differences we handle: named parameters accept bare keys, unused named params
   in a statement throw (so COUNT queries receive only the params they reference), and
   transactions use an explicit `BEGIN IMMEDIATE`/`COMMIT`/`ROLLBACK` helper (`transaction()`).
2. **Session-backed JWTs.** The JWT carries `{ sub, sid }`; `sid` is a random token whose SHA-256
   hash is stored in `sessions`. Auth = valid signature **and** live session row, so logout and
   password change revoke sessions server-side immediately.
3. **Synchronous DB, async API.** SQLite via better-sqlite3-style sync calls is fast enough at
   friend-group scale and eliminates race-prone async interleavings inside transactions.
4. **Authorization lives in services, not routes.** Route handlers never check roles; services
   throw `ApiError.forbidden/notFound`. Both REST and the socket gateway get identical checks.
