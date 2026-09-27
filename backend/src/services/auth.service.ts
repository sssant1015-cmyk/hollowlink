import jwt from 'jsonwebtoken';
import { getDb } from '../db/connection.js';
import { uuid, sha256, randomToken } from '../lib/crypto.js';
import { ApiError } from '../lib/apiError.js';
import { config } from '../config/env.js';
import {
  createUser,
  getUserRowByEmail,
  getUserRowByUsername,
  getUserRowById,
  verifyPassword,
  applyPasswordHash,
  hashPassword,
  type FullUser,
} from './users.service.js';

export interface SessionUser {
  id: string;
  username: string;
  displayName: string;
  role: 'user' | 'admin';
  avatarUrl: string | null;
}

export function toSessionUser(row: Record<string, unknown>): SessionUser {
  return {
    id: row.id as string,
    username: row.username as string,
    displayName: row.display_name as string,
    role: row.role as 'user' | 'admin',
    avatarUrl: (row.avatar_url as string | null) ?? null,
  };
}

export interface JwtPayload {
  sub: string;
  sid: string; // raw session token; we store only its hash
}

function signJwt(payload: JwtPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn'] });
}

export function decodeJwt(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    if (typeof decoded === 'object' && decoded !== null && 'sub' in decoded && 'sid' in decoded) {
      return decoded as unknown as JwtPayload;
    }
    return null;
  } catch {
    return null;
  }
}

function insertSession(userId: string, rawToken: string, meta: { ip?: string; userAgent?: string }): void {
  const ttlMs = parseTtlMs(config.jwtExpiresIn);
  getDb()
    .prepare(
      `INSERT INTO sessions (id, user_id, token_hash, user_agent, ip, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      uuid(),
      userId,
      sha256(rawToken),
      meta.userAgent ?? null,
      meta.ip ?? null,
      new Date().toISOString(),
      new Date(Date.now() + ttlMs).toISOString(),
    );
}

/** Create a session for an existing user; returns a signed JWT embedding the session token. */
export function createSession(userId: string, meta: { ip?: string; userAgent?: string }): string {
  const raw = randomToken(32);
  insertSession(userId, raw, meta);
  return signJwt({ sub: userId, sid: raw });
}

/** Validate a JWT and its backing session; returns the user or null. */
export function resolveSession(token: string): SessionUser | null {
  const payload = decodeJwt(token);
  if (!payload) return null;
  const session = getDb()
    .prepare('SELECT * FROM sessions WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?')
    .get(sha256(payload.sid), new Date().toISOString()) as { user_id: string } | undefined;
  if (!session || session.user_id !== payload.sub) return null;
  const row = getUserRowById(session.user_id);
  return row ? toSessionUser(row) : null;
}

export function revokeSession(sid: string): void {
  getDb()
    .prepare('UPDATE sessions SET revoked_at = ? WHERE token_hash = ?')
    .run(new Date().toISOString(), sha256(sid));
}

export function revokeAllSessions(userId: string): void {
  getDb()
    .prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL')
    .run(new Date().toISOString(), userId);
}

export function login(
  identifier: string,
  password: string,
  meta: { ip?: string; userAgent?: string },
): { token: string; user: SessionUser } {
  const row = identifier.includes('@') ? getUserRowByEmail(identifier) : getUserRowByUsername(identifier);
  if (!row || !verifyPassword(password, row.password_hash as string)) {
    // Uniform error — never reveal whether the account exists.
    throw ApiError.unauthorized('Invalid credentials');
  }
  const token = createSession(row.id as string, meta);
  return { token, user: toSessionUser(row) };
}

export function register(
  data: { username: string; email: string; password: string; displayName: string },
  meta: { ip?: string; userAgent?: string },
): { token: string; user: SessionUser } {
  const user: FullUser = createUser(data);
  const token = createSession(user.id, meta);
  return { token, user: toSessionUser({ ...user, avatar_url: user.avatarUrl }) };
}

export function changeOwnPassword(userId: string, currentPassword: string, newPassword: string): void {
  const row = getUserRowById(userId);
  if (!row || !verifyPassword(currentPassword, row.password_hash as string)) {
    throw ApiError.badRequest('Current password is incorrect');
  }
  applyPasswordHash(userId, hashPassword(newPassword));
  revokeAllSessions(userId);
}

function parseTtlMs(input: string): number {
  const m = /^(\d+)\s*(ms|s|m|h|d)?$/.exec(input.trim());
  if (!m) return 7 * 86_400_000;
  const n = Number(m[1]);
  const mult = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2] ?? 's']!;
  return n * mult;
}
