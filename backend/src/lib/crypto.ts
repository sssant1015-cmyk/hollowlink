import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { getDb, type DB } from '../db/connection.js';

/** Cryptographically strong random token (URL-safe). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function uuid(): string {
  return randomUUID();
}

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/** Constant-time string comparison (length info still leaks, content does not). */
export function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(sha256(a), 'hex');
  const bb = Buffer.from(sha256(b), 'hex');
  return timingSafeEqual(ab, bb);
}

/**
 * better-sqlite3-style transaction helper on node:sqlite.
 * Runs fn inside BEGIN/COMMIT, with ROLLBACK on throw.
 * Uses IMMEDIATE to avoid deadlocks on upgrade.
 */
export function transaction<T>(fn: () => T): T {
  const db: DB = getDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // already rolled back
    }
    throw err;
  }
}
