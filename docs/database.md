# Database

SQLite (via Node's built-in `node:sqlite`) in WAL mode with foreign keys enforced and a 5s busy
timeout. The file lives at `DATABASE_PATH` (default `database/hollowlink.db`).

## Migrations

- Located in `backend/src/db/migrations/`, applied in order by `migrate.ts` inside a transaction.
- Applied IDs are tracked in `_migrations`; re-running `npm run migrate` is a no-op.
- `npm run seed` inserts demo data (idempotent: skips if users exist).

## Schema (migration `0001_init`)

| Table | Purpose | Notable constraints / indexes |
| --- | --- | --- |
| `users` | accounts + profile + privacy | `username`, `email` unique (NOCASE); CHECK on status/role/privacy |
| `sessions` | JWT session store | `token_hash` unique; indexed on `user_id`, `expires_at`; FK cascade |
| `password_resets` | hashed reset tokens | single-use (`used_at`), TTL via `expires_at` |
| `friendships` | directed edges stored both ways | UNIQUE(user_id, friend_id), CHECK no self-friend |
| `friend_requests` | pending requests | UNIQUE(from_user, to_user), CHECK no self-request |
| `blocks` | blocker → blocked | UNIQUE(blocker_id, blocked_id) |
| `groups` | group metadata | `invite_code` unique; FK owner cascade |
| `group_members` | membership + role | UNIQUE(group_id, user_id); CHECK role ∈ owner/moderator/member |
| `group_invites` | reserved for per-member invite links | FK cascade |
| `posts` | feed posts | indexed `(created_at DESC)`, `(author_id, created_at)`, `(group_id, created_at)` |
| `post_media` | attached images | FK cascade; `position` for ordering |
| `comments` | post comments | indexed `(post_id, created_at)` |
| `reactions` | emoji reactions on post/comment/message | UNIQUE(user_id, target_type, target_id, emoji) |
| `reports` | moderation queue | CHECK target_type/status; indexed `(status, created_at)` |
| `conversations` | DM or group chat | `kind` CHECK; group chats link `group_id` |
| `conversation_members` | membership + read state | UNIQUE(conversation_id, user_id); `last_read_at` powers unread counts |
| `messages` | chat messages | indexed `(conversation_id, created_at)`; soft-delete via `deleted_at`; `reply_to_id` self-FK |
| `message_reactions` | message emoji | UNIQUE(message_id, user_id, emoji) |
| `events` | events | indexed on `date`; optional `group_id` FK |
| `event_attendees` | RSVP | UNIQUE(event_id, user_id); CHECK response |
| `announcements` | group announcements | indexed `(group_id, created_at)`; `pinned` flag |
| `notifications` | user notifications | indexed `(user_id, created_at)`; partial index on unread |

All user-owned rows cascade on user deletion (`ON DELETE CASCADE`), so account deletion is a
single `DELETE FROM users`. Content author references use `SET NULL` only where history should
outlive the actor (e.g. `reports.resolved_by`).

## Integrity rules enforced at the DB level

- No duplicate friendships/requests/blocks/memberships/RSVPs/reactions (UNIQUE constraints).
- No self-friendship, self-request, or self-block (CHECK constraints).
- Cascading deletes keep orphan rows from accumulating.

Application-level rules (privacy, role checks, block semantics) live in the service layer —
see `docs/security.md`.
