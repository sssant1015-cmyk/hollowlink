# Security

## Authentication

- **Password storage:** bcrypt, cost 12. Plaintext never touches the DB or logs.
- **Password policy:** ≥10 chars, at least one letter and one digit (enforced by zod server-side;
  mirrored in the UI but never trusted from it).
- **Sessions:** the JWT (`{ sub, sid }`) is meaningless without a live `sessions` row keyed by
  `SHA-256(sid)`. Logout, password change, and password reset revoke rows immediately; expired
  rows are rejected on use.
- **Cookie flags:** `httpOnly`, `SameSite=Lax`, `Secure` in production, `Path=/`.
- **Reset tokens:** random 32 bytes, stored hashed, single-use, TTL from `PASSWORD_RESET_TTL`
  (default 1h). Enumeration-safe: `POST /auth/password/forgot` always answers `{ sent: true }`.
  In production, wire an email provider in `auth.routes.ts` — the token is returned in the
  response **only** outside production (see code comment).
- **Uniform login errors:** unknown user and wrong password produce identical 401s.
- **Invite-gated registration:** when `REGISTRATION_INVITE_CODE` is set, `POST /auth/register`
  rejects requests without the exact code (403 `INVITE_REQUIRED`), compared in constant time.
  `GET /auth/registration-config` publicly reports whether the gate is on so the UI can show the
  field. Leave unset for open registration.

## Authorization model

- Every protected route sits behind `requireAuth`; every service call re-checks permissions:
  - **Ownership** — posts, comments, messages are editable/deletable by their author (group mods
    and site admins have bounded extra powers).
  - **Group roles** — `requireRole(group, user, …)` gates every mutating group operation;
    membership is verified for reads of private groups/chats/feeds.
  - **Conversation membership** — `requireConversationMember` runs before any chat read/write,
    so guessing conversation or message IDs yields 403/404, never data.
  - **Blocks** — directional (`hasBlocked`): if A blocks B, B cannot find or request A;
    requests A→B are also refused while the block stands.
  - **Profile privacy** — `public | friends | private` gates full-profile reads; private
    profiles return a minimal identity stub instead of an error (no existence leaks beyond
    username).
- **Admin-only surfaces** (report review queue) check `users.role === 'admin'` server-side.

## Input handling

- **Validation:** zod schemas on every body/query/param; parsed values (trimmed, type-coerced,
  unknown keys stripped) replace the raw ones before handlers run.
- **SQL injection:** every query is prepared/parameterized — including dynamic WHERE fragments,
  which interpolate only fixed SQL and named params.
- **LIKE escaping:** user search patterns escape `%`, `_`, `\` and use `ESCAPE '\'`.
- **Emoji allowlist:** reactions accept a fixed set; everything else is a 400.

## Uploads

- Multer memory storage; **magic bytes** (JPEG/PNG/GIF/RIFF-WEBP) determine both the truth of
  the image type and the stored extension — client MIME and filename are ignored.
- Size limits per kind (3–8 MB) enforced by multer *and* re-checked before saving.
- Files are written under a random filename into `UPLOAD_DIR/<kind>/`; served read-only by
  `express.static`.

## Platform hardening

- **helmet** security headers; CSP enabled in production; CORP `cross-origin` so uploaded media
  renders cross-origin but isn't exfiltratable via `<canvas>`.
- **CORS allowlist** from `CORS_ORIGIN` with `credentials: true`.
- **Rate limiting:** strict limiter (20/15min) on register/login/forgot/reset; general 300/min
  API limiter. Both skipped under `NODE_ENV=test` so integration tests can create fixtures.
- **JSON body cap** at 1 MB; Socket.IO buffer cap at 1 MB.
- Errors are funneled through one handler; stack traces never reach clients in production.

## Privacy commitments

- Presence reflects **in-app activity only** — online/away/offline derived from socket
  connections and idle time. No device stats, no input capture, no background collection of any
  kind.
- Private groups and DMs are readable exclusively through membership-checked queries; global
  search shares the same visibility predicates.
- No third-party telemetry, analytics, or tracking anywhere in either package.

## Known limitations (documented, deliberate)

- Email verification is a schema flag; no mailer is wired in this build (dev reset tokens are
  returned via API; production must integrate a provider and remove that).
- Rate limits are per-IP via `express-rate-limit` defaults; put a reverse proxy in front and set
  `trust proxy` accordingly in production.
- CSRF: JSON-only APIs with `SameSite=Lax` cookies + custom `Content-Type: application/json`
  requirement (fetch body) block classic form-based CSRF; a formal double-submit token is a
  future hardening step if you add cookie-authed form posts.
