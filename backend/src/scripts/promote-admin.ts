/**
 * Promote (or demote) a user to site admin.
 *
 * Usage (from repo root or backend/):
 *   npm run promote-admin -- <username>
 *   npm run promote-admin -- <username> --demote
 */
import { getDb, closeDb } from '../db/connection.js';
import { runMigrations } from '../db/migrate.js';

const args = process.argv.slice(2);
const demote = args.includes('--demote');
const username = args.find((a) => !a.startsWith('--'));

if (!username) {
  console.error('Usage: npm run promote-admin -- <username> [--demote]');
  process.exit(1);
}

runMigrations();
const db = getDb();

const row = db.prepare('SELECT id, username, role FROM users WHERE username = ? COLLATE NOCASE').get(username) as
  | { id: string; username: string; role: string }
  | undefined;

if (!row) {
  console.error(`❌ No user named "${username}".`);
  const users = db.prepare('SELECT username FROM users ORDER BY username').all() as { username: string }[];
  if (users.length > 0) console.error(`   Existing users: ${users.map((u) => u.username).join(', ')}`);
  closeDb();
  process.exit(1);
}

const nextRole = demote ? 'user' : 'admin';
if (row.role === nextRole) {
  console.log(`@${row.username} is already ${nextRole}.`);
  closeDb();
  process.exit(0);
}

db.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?').run(nextRole, new Date().toISOString(), row.id);
console.log(`✅ @${row.username} is now ${nextRole === 'admin' ? 'an admin (can review reports)' : 'a regular user'}.`);
closeDb();
