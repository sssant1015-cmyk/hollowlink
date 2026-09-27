import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

import { runMigrations } from '../src/db/migrate.js';
import { getDb, setDb, closeDb } from '../src/db/connection.js';
import { getPreferences, savePreferences, deletePreferences } from '../src/services/preferences.service.js';

beforeAll(() => {
  // Isolated DB per file (same convention as helpers.ts) — no env-var races.
  const db = new DatabaseSync(join(tmpdir(), `hollowlink-prefs-${randomBytes(6).toString('hex')}.db`));
  db.exec('PRAGMA foreign_keys = ON');
  setDb(db);
  runMigrations(db);
});
afterAll(() => closeDb());

describe('preferences', () => {
  beforeAll(() => {
    // user_preferences FKs target real users — create test users first.
    for (const id of ['u-pref-1', 'u-pref-2', 'u-pref-3']) {
      getDb()
        .prepare(
          "INSERT OR IGNORE INTO users (id, username, display_name, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .run(id, id, id, `${id}@test.local`, 'x', new Date().toISOString(), new Date().toISOString());
    }
  });
  const userId = 'u-pref-1';

  it('returns defaults when nothing saved', () => {
    const prefs = getPreferences(userId);
    expect(prefs.appearance.themeMode).toBe('dark');
    expect(prefs.appearance.presetTheme).toBe('hollow-dark');
    expect(prefs.appearance.fontFamily).toBe('inter');
    expect(prefs.accessibility.highContrast).toBe(false);
  });

  it('saves and reads back a full payload', () => {
    const saved = savePreferences(userId, {
      appearance: { themeMode: 'light', textSize: 'lg', fontFamily: 'orbitron', radius: 'sharp', animations: 'reduced' },
      accessibility: { highContrast: true, reduceMotionOverride: true },
      layout: { dashboardWidgets: [{ id: 'events', visible: false }] },
    });
    expect(saved.appearance.themeMode).toBe('light');
    const read = getPreferences(userId);
    expect(read.appearance.fontFamily).toBe('orbitron');
    expect(read.accessibility.reduceMotionOverride).toBe(true);
    expect(read.layout.dashboardWidgets).toEqual([{ id: 'events', visible: false }]);
  });

  it('merges partial saves over current values', () => {
    savePreferences(userId, { appearance: { textSize: 'xl' } });
    const prefs = getPreferences(userId);
    expect(prefs.appearance.textSize).toBe('xl');
    expect(prefs.appearance.themeMode).toBe('light'); // kept from previous save
  });

  it('rejects invalid enum values and malformed colors', () => {
    expect(() => savePreferences('u-pref-2', { appearance: { textSize: 'gigantic' } })).toThrow();
    expect(() => savePreferences('u-pref-2', { appearance: { colors: { primary: 'purple' } } })).toThrow();
    expect(() => savePreferences('u-pref-2', { appearance: { fontFamily: 'Comic Sans' } })).toThrow();
  });

  it('tolerates corrupt stored rows by falling back to defaults', () => {
    getDb()
      .prepare('INSERT INTO user_preferences (id, user_id, appearance_json, accessibility_json, layout_json, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run('corrupt-row', 'u-pref-3', '{not json', '{}', '{}', new Date().toISOString());
    const prefs = getPreferences('u-pref-3');
    expect(prefs.appearance.themeMode).toBe('dark');
    deletePreferences('u-pref-3');
  });

  it('deletes preferences (restore defaults)', () => {
    deletePreferences(userId);
    expect(getPreferences(userId).appearance.textSize).toBe('md');
  });
});
