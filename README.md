# HollowLink

**Your people. Your space. Your link.**

HollowLink is a private social application for friend groups — a digital headquarters where you can chat in real time, share posts, create private groups, plan events, and stay connected. Built by **Hollow Technologies**.

## Features

- 🔐 **Real authentication** — register, login, sessions, password reset & change, account deletion
- 👤 **Profiles** — avatars, bios, status, pronouns, privacy controls
- 🤝 **Friends** — search, requests, accept/reject, blocking
- 👥 **Private groups** — owner/moderator/member roles, invite codes, announcements
- 📰 **Feed** — posts with images, reactions, comments, reporting
- 💬 **Real-time chat** — DMs & group chats, typing indicators, read state, reactions, replies
- 📅 **Events** — RSVP (going / maybe / not going), group events
- 🔔 **Notifications** — friend requests, reactions, comments, announcements, event changes
- 🛡️ **Moderation** — reporting with status workflow, group management tools
- 🔍 **Global search** — users, groups, and your authorized content only

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 18, TypeScript, Vite, custom CSS design system |
| Backend | Node.js, Express, TypeScript, Socket.IO |
| Database | SQLite (better-sqlite3) with normalized schema & migrations |
| Auth | JWT (httpOnly cookie), bcrypt password hashing |
| Validation | Zod on every endpoint (server) & forms (client) |
| Testing | Vitest, Testing Library, Supertest |

## Project Structure

```
hollowlink/
├── backend/          # Express API + WebSocket server
│   └── src/
│       ├── config/       # env & app configuration
│       ├── db/           # connection, migrations, seed
│       ├── lib/          # helpers (crypto, tokens, responses, apiError)
│       ├── middleware/   # auth, errors, rate limit, upload, permissions
│       ├── routes/       # REST controllers
│       ├── schemas/      # zod validation schemas
│       ├── services/     # business logic (pure, testable)
│       └── socket/       # real-time gateway (chat, presence, typing)
├── frontend/         # React SPA
│   └── src/
│       ├── api/          # typed API client + socket singleton
│       ├── components/   # UI kit, feed, groups, layout, etc.
│       ├── pages/        # routed screens
│       └── styles/       # HollowLink design system
├── database/         # SQLite file lives here at runtime (gitignored)
├── docs/             # architecture, database, api, security, development, roadmap
├── scripts/          # helper scripts
├── .env.example      # placeholder environment variables
└── package.json      # npm workspaces root
```

## Quick Start

**Prerequisites:** Node.js ≥ 20, npm ≥ 10.

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# then edit .env — set JWT_SECRET to a long random string

# 3. Create database & run migrations
npm run migrate

# 4. (optional) Seed demo data: 6 users, friendships, a group, posts, messages
npm run seed

# 5. Run backend + frontend together
npm run dev
```

- Web app → http://localhost:5173
- API → http://localhost:8787/api

**Demo accounts (after seeding):** `neo` / `trinity` / `morpheus` … password `hollowlink-demo` for all.

## Development Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Run API + web dev servers concurrently |
| `npm run dev:api` / `npm run dev:web` | Run one side only |
| `npm run build` | Typecheck + production build (both packages) |
| `npm test` | Run all backend & frontend tests |
| `npm run test:api` / `npm run test:web` | Test one side |
| `npm run typecheck` | TypeScript strict check everywhere |
| `npm run migrate` | Apply database migrations |
| `npm run seed` | Seed demo data |
| `npm run promote-admin -- <username>` | Make a user an admin (add `--demote` to revert) |

## Environment Variables

Copy `.env.example` → `.env` and fill in real values. Never commit `.env`.

| Variable | Purpose |
| --- | --- |
| `PORT` | Backend HTTP port (default 8787) |
| `CORS_ORIGIN` | Allowed browser origin(s), comma-separated |
| `DATABASE_PATH` | SQLite file location |
| `UPLOAD_DIR` | Uploaded media directory |
| `JWT_SECRET` | **Required.** 64+ random hex chars |
| `JWT_EXPIRES_IN` | Session lifetime (default 7d) |
| `APP_URL` | Public web URL, used in links |
| `PASSWORD_RESET_TTL` | Reset token lifetime (default 1h) |
| `REGISTRATION_INVITE_CODE` | **Optional.** When set, only people with this code can register (invite-only mode) |

## Testing

```bash
npm test
```

Backend tests boot the real Express app against an isolated temporary SQLite database — no mocks for the data layer. Suites cover authentication, friends, groups, feed, chat, events, notifications, moderation, and security boundaries (IDOR, privilege escalation, unauthorized access, malformed requests). Frontend tests cover auth flows, feed, friends, groups, and chat rendering.

## Production Build

```bash
npm run build
npm start          # serves the API from backend/dist
```

Serve `frontend/dist` with any static host/CDN and point API calls at the backend, or place both behind a single reverse proxy (nginx/Caddy) — see `docs/architecture.md`.

## Security Highlights

- Passwords hashed with bcrypt (cost 12); never stored or logged in plaintext
- JWT in httpOnly, SameSite=Lax cookies; CSRF-safe JSON content-type requirement
- Zod validation on every request body, query, and param
- Parameterized SQL everywhere (no string-built queries)
- Uploads validated by magic bytes, size, and extension — MIME type never trusted from client
- Rate limiting on auth endpoints; secure headers via helmet
- Server-side authorization on every resource: group roles, conversation membership, ownership checks
- No telemetry, no tracking, no unnecessary data collection

See `docs/security.md` for the full threat model.

## Documentation

- [Architecture](docs/architecture.md)
- [Database](docs/database.md)
- [API reference](docs/api.md)
- [Security](docs/security.md)
- [Development guide](docs/development.md)
- [Roadmap](docs/roadmap.md)

## License

Private project — © Hollow Technologies. All rights reserved.
