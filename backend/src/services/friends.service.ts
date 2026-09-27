import { getDb } from '../db/connection.js';
import { uuid, transaction } from '../lib/crypto.js';
import { ApiError } from '../lib/apiError.js';
import { likeEscape } from '../lib/pagination.js';
import { areFriends, isBlocked, hasBlocked, toPublicUser } from './users.service.js';
import { createNotification } from './notifications.service.js';
import type { Page } from '../lib/pagination.js';

export function sendFriendRequest(fromUserId: string, toUsername: string, message?: string): void {
  const db = getDb();
  const target = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(toUsername) as
    | { id: string; username: string }
    | undefined;
  if (!target) throw ApiError.notFound('User not found');
  const toUserId = target.id;

  if (toUserId === fromUserId) throw ApiError.badRequest('You cannot befriend yourself');

  if (hasBlocked(fromUserId, toUserId)) throw ApiError.notFound('User not found'); // you blocked them: they're invisible to you
  if (hasBlocked(toUserId, fromUserId)) throw ApiError.forbidden('You cannot send a request to this user');

  if (areFriends(fromUserId, toUserId)) throw ApiError.conflict('You are already friends');

  const existing = db
    .prepare('SELECT * FROM friend_requests WHERE (from_user = ? AND to_user = ?) OR (from_user = ? AND to_user = ?)')
    .get(fromUserId, toUserId, toUserId, fromUserId);
  if (existing) {
    const existingRow = existing as { from_user: string };
    if (existingRow.from_user === fromUserId) throw ApiError.conflict('Request already sent');
    throw ApiError.conflict('This user already sent you a request — accept it instead');
  }

  db.prepare('INSERT INTO friend_requests (id, from_user, to_user, message, created_at) VALUES (?, ?, ?, ?, ?)').run(
    uuid(),
    fromUserId,
    toUserId,
    message ?? null,
    new Date().toISOString(),
  );
  createNotification({
    userId: toUserId,
    type: 'friend_request',
    title: 'New friend request',
    body: `${usernameOf(fromUserId)} sent you a friend request`,
    actorId: fromUserId,
    entityType: 'user',
    entityId: fromUserId,
  });
}

function usernameOf(userId: string): string {
  const row = getDb().prepare('SELECT username FROM users WHERE id = ?').get(userId) as { username: string } | undefined;
  return row?.username ?? 'someone';
}

export function acceptFriendRequest(userId: string, requestId: string): void {
  const db = getDb();
  const request = db.prepare('SELECT * FROM friend_requests WHERE id = ?').get(requestId) as
    | { id: string; from_user: string; to_user: string }
    | undefined;
  if (!request || request.to_user !== userId) throw ApiError.notFound('Request not found');

  if (isBlocked(userId, request.from_user)) {
    db.prepare('DELETE FROM friend_requests WHERE id = ?').run(requestId);
    throw ApiError.badRequest('This user is blocked');
  }

  const now = new Date().toISOString();
  transaction(() => {
    db.prepare('INSERT INTO friendships (id, user_id, friend_id, created_at) VALUES (?, ?, ?, ?)').run(uuid(), userId, request.from_user, now);
    db.prepare('INSERT INTO friendships (id, user_id, friend_id, created_at) VALUES (?, ?, ?, ?)').run(uuid(), request.from_user, userId, now);
    db.prepare('DELETE FROM friend_requests WHERE id = ?').run(requestId);
    db.prepare('DELETE FROM friend_requests WHERE (from_user = ? AND to_user = ?)').run(userId, request.from_user);
  });

  createNotification({
    userId: request.from_user,
    type: 'friend_accepted',
    title: 'Friend request accepted',
    body: `${usernameOf(userId)} accepted your friend request`,
    actorId: userId,
    entityType: 'user',
    entityId: userId,
  });
}

export function rejectFriendRequest(userId: string, requestId: string): void {
  const result = getDb()
    .prepare('DELETE FROM friend_requests WHERE id = ? AND to_user = ?')
    .run(requestId, userId);
  if (result.changes === 0) throw ApiError.notFound('Request not found');
}

export function cancelFriendRequest(userId: string, requestId: string): void {
  const result = getDb()
    .prepare('DELETE FROM friend_requests WHERE id = ? AND from_user = ?')
    .run(requestId, userId);
  if (result.changes === 0) throw ApiError.notFound('Request not found');
}

export function removeFriend(userId: string, friendId: string): void {
  const result = getDb()
    .prepare('DELETE FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)')
    .run(userId, friendId, friendId, userId);
  if (result.changes === 0) throw ApiError.notFound('Friendship not found');
}

export function listFriends(userId: string, page: Page): { items: ReturnType<typeof toPublicUser>[]; total: number } {
  const db = getDb();
  const total = (db.prepare('SELECT COUNT(*) AS c FROM friendships WHERE user_id = ?').get(userId) as { c: number }).c;
  const rows = db
    .prepare(
      `SELECT u.* FROM friendships f JOIN users u ON u.id = f.friend_id
       WHERE f.user_id = ? ORDER BY u.display_name COLLATE NOCASE LIMIT ? OFFSET ?`,
    )
    .all(userId, page.limit, page.offset) as Record<string, unknown>[];
  return { items: rows.map(toPublicUser), total };
}

export function listIncomingRequests(userId: string): { id: string; from: ReturnType<typeof toPublicUser>; message: string | null; createdAt: string }[] {
  const rows = getDb()
    .prepare(
      `SELECT r.id AS request_id, r.message, r.created_at, u.id AS u_id, u.username, u.display_name, u.avatar_url, u.status, u.custom_status, u.pronouns
       FROM friend_requests r JOIN users u ON u.id = r.from_user
       WHERE r.to_user = ? ORDER BY r.created_at DESC`,
    )
    .all(userId) as (Record<string, unknown> & { request_id: string; message: string | null; created_at: string })[];
  return rows.map((row) => ({
    id: row.request_id,
    from: toPublicUser({ ...row, id: row.u_id }),
    message: row.message,
    createdAt: row.created_at,
  }));
}

export function listOutgoingRequests(userId: string): { id: string; to: ReturnType<typeof toPublicUser>; createdAt: string }[] {
  const rows = getDb()
    .prepare(
      `SELECT r.id AS request_id, r.created_at, u.id AS u_id, u.username, u.display_name, u.avatar_url, u.status, u.custom_status, u.pronouns
       FROM friend_requests r JOIN users u ON u.id = r.to_user
       WHERE r.from_user = ? ORDER BY r.created_at DESC`,
    )
    .all(userId) as (Record<string, unknown> & { request_id: string; created_at: string; u_id: string })[];
  return rows.map((row) => ({ id: row.request_id, to: toPublicUser({ ...row, id: row.u_id }), createdAt: row.created_at }));
}

export function blockUser(blockerId: string, targetId: string): void {
  if (blockerId === targetId) throw ApiError.badRequest('You cannot block yourself');
  const db = getDb();
  transaction(() => {
    // Blocking removes friendship and any pending requests both ways.
    db.prepare('DELETE FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)').run(
      blockerId,
      targetId,
      targetId,
      blockerId,
    );
    db.prepare('DELETE FROM friend_requests WHERE (from_user = ? AND to_user = ?) OR (from_user = ? AND to_user = ?)').run(
      blockerId,
      targetId,
      targetId,
      blockerId,
    );
    db.prepare('INSERT OR IGNORE INTO blocks (id, blocker_id, blocked_id, created_at) VALUES (?, ?, ?, ?)').run(
      uuid(),
      blockerId,
      targetId,
      new Date().toISOString(),
    );
  });
}

export function unblockUser(blockerId: string, targetId: string): void {
  const result = getDb().prepare('DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?').run(blockerId, targetId);
  if (result.changes === 0) throw ApiError.notFound('Block not found');
}

export function listBlocks(userId: string): ReturnType<typeof toPublicUser>[] {
  const rows = getDb()
    .prepare(
      `SELECT u.* FROM blocks b JOIN users u ON u.id = b.blocked_id WHERE b.blocker_id = ? ORDER BY u.username COLLATE NOCASE`,
    )
    .all(userId) as Record<string, unknown>[];
  return rows.map(toPublicUser);
}

export function searchUsers(viewerId: string, query: string, page: Page): { items: ReturnType<typeof toPublicUser>[]; total: number } {
  const db = getDb();
  const pattern = `%${likeEscape(query)}%`;
  const where = `
    u.id != @viewer
    AND u.privacy_profile != 'private'
    AND u.id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = @viewer)
    AND u.id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id = @viewer)
  `;
  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM users u WHERE ${where} AND (u.username LIKE @pattern ESCAPE '\\' OR u.display_name LIKE @pattern ESCAPE '\\')`)
      .get({ viewer: viewerId, pattern }) as { c: number }
  ).c;
  const rows = db
    .prepare(
      `SELECT u.* FROM users u WHERE ${where}
       AND (u.username LIKE @pattern ESCAPE '\\' OR u.display_name LIKE @pattern ESCAPE '\\')
       ORDER BY u.username COLLATE NOCASE LIMIT @limit OFFSET @offset`,
    )
    .all({ viewer: viewerId, pattern, limit: page.limit, offset: page.offset }) as Record<string, unknown>[];
  return { items: rows.map(toPublicUser), total };
}
