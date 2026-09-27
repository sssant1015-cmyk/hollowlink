# Roadmap

## Shipped in this build

- ✅ Phase 1 — Foundation: monorepo, Express + TS, `node:sqlite` layer, migrations, config, error envelope, middleware
- ✅ Phase 2 — Accounts: register/login/logout, server-revocable sessions, password change/reset, account deletion, profiles + avatars, privacy settings
- ✅ Phase 3 — Friends: search, requests, accept/reject/cancel, unfriend, directional blocking
- ✅ Phase 4 — Groups: roles (owner/mod/member), invite codes + rotation, join/leave/remove, ownership transfer, announcements, group art uploads
- ✅ Phase 5 — Feed: posts with images, home/group/profile feeds, reactions (allowlist), comments, reporting, pagination
- ✅ Phase 6 — Messaging: DMs + group chat, Socket.IO gateway, typing indicators, read state, reactions, replies, edit/delete
- ✅ Phase 7 — Events: creation, RSVP, group events, creator notifications
- ✅ Phase 8 — Moderation: reports with status workflow, admin queue, group management tools
- ✅ Phase 9 — Polish: dark glass design system, responsive sidebar/bottom-nav, skeletons, empty/error states, toasts, confirm dialogs, a11y (labels, roles, focus states)
- ✅ Phase 10 — Security & QA: 45 backend integration tests + 7 frontend tests, IDOR/privilege-escalation suites, helmet/CORS/rate limits, upload sniffing, build verification

## Next up (suggested order)

1. **Email delivery** — plug a provider (e.g. Resend/SES) into `/auth/password/forgot` and
   registration verification; remove the dev-only token return behind a `NODE_ENV` guard.
2. **Chat polish** — unread badge on group chat per member, link previews, image attachments in
   messages, message pagination with "load older" anchor.
3. **Realtime resilience** — reconnect backoff UX, offline queue for outgoing messages, delta
   sync on reconnect instead of full refetch.
4. **Media pipeline** — server-side image resize/compress (sharp), AVIF output, S3-compatible
   storage adapter behind the existing upload interface.
5. **Moderation v2** — group-level report triage for moderators (currently site-admin only),
   auto-mute thresholds, audit log.

## Bigger bets

- **Mobile app** — React Native shell reusing the REST/Socket API as-is.
- **Push notifications** — Web Push for offline members; per-type preference toggles already
  exist in the schema (`notification_prefs`).
- **Voice rooms** — WebRTC mesh for small groups, gated by group roles.
- **End-to-end encryption for DMs** — sender-key ratchet per conversation; key lifecycle is the
  hard part, the rest of the stack is transport-agnostic.
- **Federation-ready identity** — move `users` auth to DID/OIDC accounts later without touching
  content tables (ids are already opaque strings).

## Tech debt register

- Offset pagination is fine at friend-group scale; switch to cursor (`created_at DESC, id`) if
  feeds grow past ~10k rows per user.
- Presence registry is in-memory; multi-instance deployments need Redis pub/sub (or sticky
  sessions) before scaling past one node.
- `group_invites` table is scaffolded but unused (groups use a single rotating code); either
  implement per-member invite links or drop the table.
- CSRF posture relies on SameSite=Lax + JSON content type; add double-submit tokens if cookie-
  authed form posts ever appear.
