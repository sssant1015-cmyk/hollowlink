import type { DB } from '../connection.js';

export function up(db: DB): void {
  db.exec(`
    CREATE TABLE user_preferences (
      id                 TEXT PRIMARY KEY,
      user_id            TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      appearance_json    TEXT NOT NULL DEFAULT '{}',
      accessibility_json TEXT NOT NULL DEFAULT '{}',
      layout_json        TEXT NOT NULL DEFAULT '{}',
      updated_at         TEXT NOT NULL
    );

    CREATE TABLE extensions (
      id            TEXT PRIMARY KEY,          -- manifest id e.g. "example.hello"
      name          TEXT NOT NULL,
      version       TEXT NOT NULL,
      author        TEXT NOT NULL DEFAULT '',
      description   TEXT NOT NULL DEFAULT '',
      manifest_json TEXT NOT NULL,             -- full validated manifest
      builtin       INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL
    );

    CREATE TABLE user_extensions (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      extension_id TEXT NOT NULL REFERENCES extensions(id) ON DELETE CASCADE,
      enabled    INTEGER NOT NULL DEFAULT 0,
      granted_permissions_json TEXT NOT NULL DEFAULT '[]',
      settings_json TEXT NOT NULL DEFAULT '{}',
      installed_at TEXT NOT NULL,
      UNIQUE (user_id, extension_id)
    );
    CREATE INDEX idx_user_extensions_user ON user_extensions(user_id);
  `);
}

export function down(db: DB): void {
  db.exec(`
    DROP TABLE IF EXISTS user_extensions;
    DROP TABLE IF EXISTS extensions;
    DROP TABLE IF EXISTS user_preferences;
  `);
}
