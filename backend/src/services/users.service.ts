import bcrypt from 'bcryptjs';
import { getDb } from '../db/connection.js';
import { uuid, sha256, randomToken } from '../lib/crypto.js';
import { ApiError } from '../lib/apiError.js';

const BCRYPT_COST = 12;

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  status: string;
  customStatus: string | null;
  pronouns: string | null;
}

export interface FullUser extends PublicUser {
  email: string;
  bio: string;
  location: string | null;
  role: 'user' | 'admin';
  privacyProfile: 'public' | 'friends' | 'private';
  privacyPresence: 'public' | 'friends' | 'private';
  emailVerified: boolean;
  createdAt: string;
}

export function toPublicUser(row: Record<string, unknown>): PublicUser {
  return {
    id: row.id as string,
    username: row.username as string,
    displayName: row.display_name as string,
    avatarUrl: (row.avatar_url as string | null) ?? null,
    status: row.status as string,
    customStatus: (row.custom_status as string | null) ?? null,
    pronouns: (row.pronouns as string | null) ?? null,
  };
}

export function toFullUser(row: Record<string, unknown>): FullUser {
  return {
    ...toPublicUser(row),
    email: row.email as string,
    bio: row.bio as string,
    location: (row.location as string | null) ?? null,
    role: row.role as 'user' | 'admin',
    privacyProfile: row.privacy_profile as 'public' | 'friends' | 'private',
    privacyPresence: row.privacy_presence as 'public' | 'friends' | 'private',
    emailVerified: Boolean(row.email_verified),
    createdAt: row.created_at as string,
  };
}

export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, BCRYPT_COST);
}

export function verifyPassword(plain: string, hash: string): boolean {
  return bcrypt.compareSync(plain, hash);
}

export function getUserRowById(id: string): Record<string, unknown> | undefined {
  return getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) as Record<string, unknown> | undefined;
}

export function getUserRowByUsername(username: string): Record<string, unknown> | undefined {
  return getDb().prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username) as
    | Record<string, unknown>
    | undefined;
}

export function getUserRowByEmail(email: string): Record<string, unknown> | undefined {
  return getDb().prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(email) as
    | Record<string, unknown>
    | undefined;
}

export function getUserOrThrow(id: string): Record<string, unknown> {
  const row = getUserRowById(id);
  if (!row) throw ApiError.notFound('User not found');
  return row;
}

export interface CreateUserData {
  username: string;
  email: string;
  password: string;
  displayName: string;
}

export function createUser(data: CreateUserData): FullUser {
  const db = getDb();
  const now = new Date().toISOString();
  const row = {
    id: uuid(),
    username: data.username,
    email: data.email,
    password_hash: hashPassword(data.password),
    display_name: data.displayName,
    created_at: now,
    updated_at: now,
  };
  try {
    db.prepare(
      `INSERT INTO users (id, username, email, password_hash, display_name, created_at, updated_at)
       VALUES (@id, @username, @email, @password_hash, @display_name, @created_at, @updated_at)`,
    ).run(row);
  } catch (err) {
    if (err instanceof Error && err.message.includes('UNIQUE')) {
      throw ApiError.conflict('Username or email already taken');
    }
    throw err;
  }
  return toFullUser(getUserOrThrow(row.id));
}

export interface UpdateUserData {
  displayName?: string;
  bio?: string;
  pronouns?: string | null;
  location?: string | null;
  customStatus?: string | null;
  avatarUrl?: string | null;
  privacyProfile?: 'public' | 'friends' | 'private';
  privacyPresence?: 'public' | 'friends' | 'private';
}

export function updateUser(id: string, data: UpdateUserData): FullUser {
  const db = getDb();
  const allowed: Partial<Record<string, unknown>> = {};
  if (data.displayName !== undefined) allowed.display_name = data.displayName;
  if (data.bio !== undefined) allowed.bio = data.bio;
  if (data.pronouns !== undefined) allowed.pronouns = data.pronouns;
  if (data.location !== undefined) allowed.location = data.location;
  if (data.customStatus !== undefined) allowed.custom_status = data.customStatus;
  if (data.avatarUrl !== undefined) allowed.avatar_url = data.avatarUrl;
  if (data.privacyProfile !== undefined) allowed.privacy_profile = data.privacyProfile;
  if (data.privacyPresence !== undefined) allowed.privacy_presence = data.privacyPresence;

  if (Object.keys(allowed).length > 0) {
    allowed.updated_at = new Date().toISOString();
    const sets = Object.keys(allowed)
      .map((k) => `${k} = @${k}`)
      .join(', ');
    db.prepare(`UPDATE users SET ${sets} WHERE id = @id`).run({ ...allowed, id });
  }
  return toFullUser(getUserOrThrow(id));
}

export function changePassword(userId: string, currentPlain: string, newPlain: string): void {
  const row = getUserOrThrow(userId);
  if (!verifyPassword(currentPlain, row.password_hash as string)) {
    throw ApiError.badRequest('Current password is incorrect');
  }
  applyPasswordHash(userId, hashPassword(newPlain));
}

export function applyPasswordHash(userId: string, hash: string): void {
  getDb()
    .prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
    .run(hash, new Date().toISOString(), userId);
}

export function deleteUser(id: string): void {
  getDb().prepare('DELETE FROM users WHERE id = ?').run(id);
}

// ── password reset tokens ────────────────────────────────────────────

export function createPasswordResetToken(userId: string, ttlMs: number): string {
  const token = randomToken(32);
  const db = getDb();
  db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(userId);
  db.prepare(
    `INSERT INTO password_resets (id, user_id, token_hash, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(uuid(), userId, sha256(token), new Date(Date.now() + ttlMs).toISOString(), new Date().toISOString());
  return token;
}

export function consumePasswordResetToken(token: string): string {
  const row = getDb()
    .prepare('SELECT * FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?')
    .get(sha256(token), new Date().toISOString()) as { user_id: string; id: string } | undefined;
  if (!row) throw ApiError.badRequest('Invalid or expired reset token');
  getDb().prepare('UPDATE password_resets SET used_at = ? WHERE id = ?').run(new Date().toISOString(), row.id);
  return row.user_id;
}

// ── relationships helpers used across services ───────────────────────

export function areFriends(a: string, b: string): boolean {
  return Boolean(
    getDb()
      .prepare('SELECT 1 FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)')
      .get(a, b, b, a),
  );
}

export function isBlocked(blocker: string, blocked: string): boolean {
  return Boolean(
    getDb()
      .prepare('SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)')
      .get(blocker, blocked, blocked, blocker),
  );
}

/** Directional check: has `blocker` specifically blocked `target`? */
export function hasBlocked(blocker: string, target: string): boolean {
  return Boolean(
    getDb().prepare('SELECT 1 FROM blocks WHERE blocker_id = ? AND blocked_id = ?').get(blocker, target),
  );
}

export function assertCanViewProfile(viewerId: string | undefined, target: Record<string, unknown>): void {
  const privacy = target.privacy_profile as string;
  const targetId = target.id as string;
  if (privacy === 'public' || viewerId === targetId) return;
  if (!viewerId) throw ApiError.forbidden('This profile is private');
  if (privacy === 'friends' && areFriends(viewerId, targetId)) return;
  throw ApiError.forbidden('This profile is private');
}

export function getPublicUserById(viewerId: string | undefined, id: string): PublicUser {
  const row = getUserOrThrow(id);
  const privacy = row.privacy_profile as string;
  if (privacy !== 'public' && viewerId !== id && !(privacy === 'friends' && viewerId && areFriends(viewerId, id))) {
    // Minimal identity stub for private profiles.
    return { id, username: row.username as string, displayName: row.display_name as string, avatarUrl: null, status: 'offline', customStatus: null, pronouns: null };
  }
  return toPublicUser(row);
}
