import { getDb, closeDb } from './connection.js';
import { transaction } from '../lib/crypto.js';
import { up as m0001 } from './migrations/0001_init.js';
import { up as m0002 } from './migrations/0002_preferences_extensions.js';

interface Migration {
  id: string;
  up: (db: import('./connection.js').DB) => void;
}

const MIGRATIONS: Migration[] = [
  { id: '0001_init', up: m0001 },
  { id: '0002_preferences_extensions', up: m0002 },
];

export function runMigrations(database: import('./connection.js').DB = getDb()): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id         TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);
  const applied = new Set(
    database.prepare('SELECT id FROM _migrations').all().map((r) => (r as { id: string }).id),
  );

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;
    transaction(() => {
      migration.up(database);
      database
        .prepare('INSERT INTO _migrations (id, applied_at) VALUES (?, ?)')
        .run(migration.id, new Date().toISOString());
    });
    console.log(`✅ applied migration ${migration.id}`);
  }
}

// Allow running directly: npm run migrate
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('db/migrate.ts')) {
  runMigrations();
  closeDb();
  console.log('Database ready.');
}
