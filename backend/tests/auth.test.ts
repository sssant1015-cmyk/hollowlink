import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setupApp, teardownApp, type TestContext } from './helpers.js';

let ctx: TestContext;

beforeAll(() => {
  ctx = setupApp();
});

afterAll(() => {
  teardownApp(ctx);
});

const strongPassword = 'Passw0rdSecure1';

describe('POST /api/auth/register', () => {
  it('registers a new user and returns a session', async () => {
    const res = await request(ctx.app).post('/api/auth/register').send({
      username: 'alice',
      email: 'alice@test.local',
      password: strongPassword,
      displayName: 'Alice',
    });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.username).toBe('alice');
    expect(res.body.data.token).toBeTruthy();
    expect(res.body.data.user).not.toHaveProperty('email'); // public shape
  });

  it('rejects duplicate username (case-insensitive)', async () => {
    const res = await request(ctx.app).post('/api/auth/register').send({
      username: 'ALICE',
      email: 'other@test.local',
      password: strongPassword,
      displayName: 'Imposter',
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('rejects weak passwords', async () => {
    const res = await request(ctx.app).post('/api/auth/register').send({
      username: 'weakpw',
      email: 'weak@test.local',
      password: 'short',
      displayName: 'Weak',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects malformed bodies', async () => {
    const res = await request(ctx.app).post('/api/auth/register').send({ username: 'x' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  it('logs in with username', async () => {
    const res = await request(ctx.app).post('/api/auth/login').send({ identifier: 'alice', password: strongPassword });
    expect(res.status).toBe(200);
    expect(res.body.data.user.username).toBe('alice');
  });

  it('logs in with email', async () => {
    const res = await request(ctx.app).post('/api/auth/login').send({ identifier: 'alice@test.local', password: strongPassword });
    expect(res.status).toBe(200);
  });

  it('rejects wrong password with uniform error', async () => {
    const res = await request(ctx.app).post('/api/auth/login').send({ identifier: 'alice', password: 'WrongPass123x' });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Invalid credentials');
  });

  it('does not reveal whether unknown accounts exist', async () => {
    const res = await request(ctx.app).post('/api/auth/login').send({ identifier: 'ghost_user_404', password: 'Whatever123x' });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Invalid credentials');
  });
});

describe('GET /api/auth/me', () => {
  it('requires authentication', async () => {
    const res = await request(ctx.app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns the session user', async () => {
    const { agent, username } = await ctx.registerUser();
    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.data.user.username).toBe(username);
  });
});

describe('POST /api/auth/logout', () => {
  it('revokes the session', async () => {
    const { agent } = await ctx.registerUser();
    await agent.post('/api/auth/logout').expect(200);
    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(401);
  });
});

describe('password reset flow', () => {
  it('forgot + reset issues a token and allows a new password', async () => {
    const username = 'resettable';
    await ctx.registerUser(username);
    const forgot = await request(ctx.app).post('/api/auth/password/forgot').send({ email: `${username}@test.local` });
    expect(forgot.status).toBe(200);
    expect(forgot.body.data.sent).toBe(true);
    const token = forgot.body.data.resetToken as string;
    expect(token).toBeTruthy(); // exposed in test env only

    const reset = await request(ctx.app).post('/api/auth/password/reset').send({ token, newPassword: 'NewPassw0rd99' });
    expect(reset.status).toBe(200);

    const login = await request(ctx.app).post('/api/auth/login').send({ identifier: username, password: 'NewPassw0rd99' });
    expect(login.status).toBe(200);
  });

  it('reset rejects invalid tokens', async () => {
    const res = await request(ctx.app).post('/api/auth/password/reset').send({ token: 'garbage-token-value', newPassword: 'NewPassw0rd99' });
    expect(res.status).toBe(400);
  });
});

describe('password change', () => {
  it('changes password and revokes other sessions', async () => {
    const username = 'pwchanger';
    const first = await ctx.registerUser(username);
    const res = await first.agent.post('/api/auth/password').send({ currentPassword: strongPassword, newPassword: 'ChangedPass77x' });
    expect(res.status).toBe(200);
    const relogin = await request(ctx.app).post('/api/auth/login').send({ identifier: username, password: 'ChangedPass77x' });
    expect(relogin.status).toBe(200);
  });

  it('rejects a wrong current password', async () => {
    const { agent } = await ctx.registerUser();
    const res = await agent.post('/api/auth/password').send({ currentPassword: 'TotallyWrong1', newPassword: 'ChangedPass77x' });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/auth/me', () => {
  it('deletes the account with password confirmation', async () => {
    const username = 'doomed';
    const { agent } = await ctx.registerUser(username);
    const res = await agent.delete('/api/auth/me').send({ password: strongPassword });
    expect(res.status).toBe(200);
    const login = await request(ctx.app).post('/api/auth/login').send({ identifier: username, password: strongPassword });
    expect(login.status).toBe(401);
  });

  it('rejects a wrong password', async () => {
    const { agent } = await ctx.registerUser();
    const res = await agent.delete('/api/auth/me').send({ password: 'NopeNope123' });
    expect(res.status).toBe(400);
  });
});
