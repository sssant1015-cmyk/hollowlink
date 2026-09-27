# REST API

Base URL: `/api`. All responses use the envelope:

```json
{ "success": true, "data": {}, "error": null }
{ "success": false, "data": null, "error": { "code": "…", "message": "…" } }
```

Auth: JWT in the `hollowlink_token` httpOnly cookie (set on login/register) or
`Authorization: Bearer <token>`. Endpoints marked 🔒 require a valid session.

Pagination: `?limit=1..50&offset=0` on list endpoints; responses are `{ items, total }`.

## Auth — `/auth`

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/auth/register` | `{ username, email, password, displayName }` → 201, sets cookie |
| POST | `/auth/login` | `{ identifier, password }` (username or email) |
| POST | `/auth/logout` 🔒 | revokes the session server-side |
| GET | `/auth/me` 🔒 | full profile of the session user |
| POST | `/auth/password` 🔒 | `{ currentPassword, newPassword }`; revokes all sessions |
| POST | `/auth/password/forgot` | `{ email }` → always `{ sent: true }` (anti-enumeration); token returned in non-prod only |
| POST | `/auth/password/reset` | `{ token, newPassword }`; single-use, revokes sessions |
| DELETE | `/auth/me` 🔒 | `{ password }` confirm; cascades all user data |

## Users / profile — `/users`

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/users/me` 🔒 | own full profile |
| PATCH | `/users/me` 🔒 | displayName, bio, pronouns, location, customStatus, privacyProfile, privacyPresence |
| POST | `/users/me/avatar` 🔒 | multipart `avatar`; magic-byte validated |
| GET | `/users/:id` 🔒 | honors target's `privacyProfile` (private profiles return a stub) |

## Friends — `/friends` (all 🔒)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/friends` | friend list (paged) |
| GET | `/friends/requests` | `{ incoming, outgoing }` |
| POST | `/friends/requests` | `{ username \| userId, message? }` |
| POST | `/friends/requests/:id/accept` | recipient only |
| DELETE | `/friends/requests/:id` | cancel (sender) or reject (recipient) |
| DELETE | `/friends/:id` | remove friend |
| POST | `/friends/:id/block` | removes friendship + pending requests; mutual invisibility |
| DELETE | `/friends/:id/block` | unblock |
| GET | `/friends/blocked` | list of blocked users |
| GET | `/friends/search?q=` | users by username/display name; excludes blocks & private profiles |

## Groups — `/groups` (all 🔒)

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/groups` | `{ name, description?, isPrivate }` — creator becomes owner |
| GET | `/groups` | the caller's groups |
| GET | `/groups/discover?q=` | public groups only |
| POST | `/groups/join` | `{ code }` — join by invite code |
| GET | `/groups/:id` | private groups: members only |
| PATCH | `/groups/:id` | owner only |
| DELETE | `/groups/:id` | owner only |
| POST | `/groups/:id/join` | public groups only |
| POST | `/groups/:id/leave` | owner cannot leave |
| GET | `/groups/:id/members` | members only; paged |
| POST | `/groups/:id/invite` | `{ friendId }` — members can invite friends |
| POST | `/groups/:id/rotate-invite` | owner only |
| POST | `/groups/:id/members/:memberId/remove` | mods remove members; owner removes anyone |
| POST | `/groups/:id/members/:memberId/role` | owner only; `moderator` / `member` / ownership transfer |
| GET/POST | `/groups/:id/announcements` | members read; mods/owner write (fans out notifications) |
| DELETE | `/groups/:id/announcements/:aid` | mods/owner |
| POST | `/groups/:id/icon` / `/:id/banner` | owner only; multipart upload |

Roles: **owner** (everything) → **moderator** (announcements, remove members, approve nothing
else) → **member** (read, post, invite friends). All checks are server-side.

## Feed — `/feed`

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/feed` 🔒 | home feed: own + friends' + your groups' posts (paged) |
| POST | `/feed` 🔒 | JSON `{ content, groupId? }` or multipart with `image` + fields |
| GET | `/feed/users/:id` 🔒 | visibility-filtered profile posts |
| GET | `/feed/groups/:id` 🔒 | members only |
| GET | `/feed/posts/:id` | per-post visibility check |
| PATCH | `/feed/posts/:id` 🔒 | author only |
| DELETE | `/feed/posts/:id` 🔒 | author, group mod, or site admin |
| GET/POST | `/feed/posts/:id/comments` 🔒 | create returns the comment; notify post author |
| PATCH/DELETE | `/feed/comments/:id` 🔒 | author, group mod, or admin |
| POST | `/feed/reactions` 🔒 | `{ targetType: post\|comment, targetId, emoji }` — toggle; allowlist enforced |

## Chat — `/chat` (all 🔒)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/chat` | conversations sorted by last activity, with unread counts |
| POST | `/chat/dm` | `{ userId }` — friends only; idempotent per pair |
| GET | `/chat/group/:groupId` | group chat (auto-created, membership synced) |
| GET | `/chat/:id` | members only |
| GET | `/chat/:id/messages` | paged, oldest→newest |
| POST | `/chat/:id/read` | mark read |
| PATCH | `/chat/messages/:messageId` | author only |
| DELETE | `/chat/messages/:messageId` | author only (soft delete) |

Real-time events (Socket.IO, same authorization): `chat:join/leave`, `chat:message`,
`chat:typing`, `chat:read`, `chat:edit`, `chat:delete`, `chat:react`; server emits
`chat:message`, `chat:edited`, `chat:deleted`, `chat:reacted`, `chat:typing`, `chat:read`,
`chat:notify`, `presence:update`, `presence:list`, `error:api`.

## Events — `/events` (all 🔒)

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/events` | `{ title, date, startTime, endTime?, location?, groupId?, description? }` |
| GET | `/events?scope=upcoming\|all` | creator/attendee/friend/group visibility |
| GET | `/events/:id` | creator, attendees, friends of creator, or group members |
| POST | `/events/:id/rsvp` | `{ response: going\|maybe\|not_going }`; notifies creator |
| DELETE | `/events/:id` | creator or group mod |

## Notifications — `/notifications` (all 🔒)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/notifications?unreadOnly=true` | `{ items, total, unread }` |
| POST | `/notifications/:id/read` | |
| POST | `/notifications/read-all` | |
| GET/PUT | `/notifications/preferences` | `{ preferences: { [key]: boolean } }` |

## Search — `/search?q=...` 🔒

Returns `{ users, groups, posts }` — all results pre-filtered by what the caller may see.

## Reports — `/reports` (all 🔒)

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/reports` | `{ targetType, targetId, reason, description? }` — target must exist |
| GET | `/reports/mine` | the caller's reports |
| GET | `/reports?status=` | admin only |
| PATCH | `/reports/:id` | admin only: `{ status }` |

## Misc

- `GET /api/health` — liveness probe.
- Static: `/uploads/*` — uploaded media (avatars, post images, group art).
