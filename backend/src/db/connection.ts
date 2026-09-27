import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config/env.js';

export type DB = DatabaseSync;

let db: DB | null = null;

export function getDb(): DB {
  if (!db) {
    fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });
    db = new DatabaseSync(config.databasePath);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');
    db.exec('PRAGMA busy_timeout = 5000');
  }
  return db;
}

/** Test helper: swap the connection (e.g., to an isolated file DB). */
export function setDb(instance: DB | null): void {
  if (db && db !== instance) db.close();
  db = instance;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
