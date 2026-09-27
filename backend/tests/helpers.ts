import { createApp } from '../src/index.js';
import { setDb } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrate.js';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import type { Express } from 'express';

process.env.VITEST = 'true';
process.env.NODE_ENV = 'test';
process.env.UPLOAD_DIR = join(tmpdir(), `hollowlink-uploads-${randomBytes(4).toString('hex')}`);

export interface TestContext {
  app: Express;
  db: DatabaseSync;
  registerUser: (username?: string) => Promise<{ token: string; id: string; username: string; agent: request.SuperAgentTest }>;
}

export function setupApp(): TestContext {
  const dbPath = join(tmpdir(), `hollowlink-test-${randomBytes(6).toString('hex')}.db`);
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON');
  setDb(db);
  runMigrations(db);
  const app = createApp();

  const registerUser = async (username = `user_${randomBytes(4).toString('hex')}`) => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username, email: `${username}@test.local`, password: 'Passw0rdSecure1', displayName: `Display ${username}` });
    if (res.status !== 201) throw new Error(`register failed: ${JSON.stringify(res.body)}`);
    const agent = request.agent(app);
    // Attach cookie via login-style: supertest agents persist cookies
    await agent.post('/api/auth/login').send({ identifier: username, password: 'Passw0rdSecure1' });
    return {
      token: res.body.data.token as string,
      id: res.body.data.user.id as string,
      username,
      agent,
    };
  };

  return { app, db, registerUser };
}

export function teardownApp(ctx: TestContext): void {
  setDb(null); // closes the connection it held
  try {
    ctx.db.close();
  } catch {
    // already closed via setDb
  }
}
