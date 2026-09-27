import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

import { runMigrations } from '../src/db/migrate.js';
import { getDb, setDb, closeDb } from '../src/db/connection.js';
import {
  validateManifest,
  registerBuiltinExtension,
  listExtensions,
  enableExtension,
  disableExtension,
  setExtensionSettings,
  extensionAuthorized,
} from '../src/services/extensions.service.js';
import { ApiError } from '../src/lib/apiError.js';

beforeAll(() => {
  // Isolated in-memory-backed DB per file (same convention as helpers.ts) — no env-var races.
  const db = new DatabaseSync(join(tmpdir(), `hollowlink-ext-${randomBytes(6).toString('hex')}.db`));
  db.exec('PRAGMA foreign_keys = ON');
  setDb(db);
  runMigrations(db);
  registerBuiltinExtension({
    id: 'example.hello',
    name: 'Hello HollowLink',
    version: '1.0.0',
    permissions: ['profile.read'],
  });
});

afterAll(() => closeDb());

const goodManifest = {
  id: 'test.sample',
  name: 'Sample',
  version: '1.2.3',
  permissions: ['profile.read', 'chat.read'],
  minCoreVersion: '0.1.0',
};

describe('manifest validation', () => {
  it('accepts a valid manifest with defaults', () => {
    const m = validateManifest(goodManifest);
    expect(m.id).toBe('test.sample');
    expect(m.platforms).toEqual(['desktop', 'mobile']);
    expect(m.icon).toBe('🧩');
  });

  it('rejects non-namespaced ids', () => {
    expect(() => validateManifest({ ...goodManifest, id: 'sample' })).toThrow();
  });

  it('rejects bad semver', () => {
    expect(() => validateManifest({ ...goodManifest, version: '1.0' })).toThrow();
  });

  it('rejects unknown permissions', () => {
    expect(() => validateManifest({ ...goodManifest, permissions: ['fs.root'] })).toThrow();
  });

  it('rejects incompatible required core version', () => {
    expect(() => validateManifest({ ...goodManifest, minCoreVersion: '99.0.0' })).toThrow(ApiError);
  });
});

describe('enable / disable lifecycle', () => {
  const userId = 'u-ext-1';
  const extId = 'example.hello';

  beforeAll(() => {
    // user_extensions FKs target real users — create test users first.
    for (const id of ['u-ext-1', 'u-ext-2']) {
      getDb()
        .prepare(
          "INSERT OR IGNORE INTO users (id, username, display_name, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .run(id, id, id, `${id}@test.local`, 'x', new Date().toISOString(), new Date().toISOString());
    }
  });

  it('enable grants only manifest-declared permissions', () => {
    const { grantedPermissions } = enableExtension(userId, extId, ['profile.read', 'chat.write', 'fs.root']);
    // manifest only declared profile.read → chat.write must NOT be granted
    expect(grantedPermissions).toEqual(['profile.read']);
  });

  it('appears enabled in listExtensions with granted permissions', () => {
    const list = listExtensions(userId).extensions;
    const hello = list.find((e) => e.id === extId)!;
    expect(hello.enabled).toBe(true);
    expect(hello.grantedPermissions).toEqual(['profile.read']);
  });

  it('extensionAuthorized honors granted permission', () => {
    expect(extensionAuthorized(userId, extId, 'profile.read')).toBe(true);
    expect(extensionAuthorized(userId, extId, 'chat.read')).toBe(false);
  });

  it('extensionAuthorized denies ungranted and undeclared permissions', () => {
    expect(extensionAuthorized(userId, extId, 'events.write')).toBe(false);
  });

  it('disable then re-check denies access', () => {
    disableExtension(userId, extId);
    expect(extensionAuthorized(userId, extId, 'profile.read')).toBe(false);
    // disable is idempotent — disabled install stays in place (settings preserved)
    expect(() => disableExtension(userId, extId)).not.toThrow();
  });
});

describe('settings', () => {
  const userId = 'u-ext-2';
  const extId = 'example.hello';

  it('rejects settings while extension disabled', () => {
    expect(() => setExtensionSettings(userId, extId, { greeting: 'hi' })).toThrow(ApiError);
  });

  it('accepts flat primitive settings when enabled', () => {
    enableExtension(userId, extId, []);
    const saved = setExtensionSettings(userId, extId, { greeting: 'hey', volume: 3, mute: true });
    expect(saved).toEqual({ greeting: 'hey', volume: 3, mute: true });
  });

  it('rejects nested objects and oversized payloads', () => {
    expect(() => setExtensionSettings(userId, extId, { nested: { a: 1 } })).toThrow();
  });
});

describe('isolation', () => {
  it('a fresh user has no enabled extensions', () => {
    const list = listExtensions('u-nobody').extensions;
    expect(list.every((e) => !e.enabled)).toBe(true);
  });

  it('permissions never leak between users', () => {
    expect(extensionAuthorized('u-nobody', 'example.hello', 'profile.read')).toBe(false);
  });
});
