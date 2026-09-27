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

describe('registration-config endpoint', () => {
  it('reports invite not required by default', async () => {
    const res = await request(ctx.app).get('/api/auth/registration-config').expect(200);
    expect(res.body.data.inviteRequired).toBe(false);
  });
});

describe('invite gate (configured via env)', () => {
  // The gate reads config at request time, so we can flip the env var live.
  const ORIGINAL = process.env.REGISTRATION_INVITE_CODE;

  it('rejects registration without the code when configured', async () => {
    process.env.REGISTRATION_INVITE_CODE = 'secret-gate-code';
    const { config } = await import('../src/config/env.js');
    (config as { registrationInviteCode?: string }).registrationInviteCode = 'secret-gate-code';
    try {
      const res = await request(ctx.app).post('/api/auth/register').send({
        username: 'noinvite',
        email: 'noinvite@test.local',
        password: 'Passw0rdGate99',
        displayName: 'No Invite',
      });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('INVITE_REQUIRED');
    } finally {
      (config as { registrationInviteCode?: string }).registrationInviteCode = ORIGINAL;
      process.env.REGISTRATION_INVITE_CODE = ORIGINAL;
    }
  });

  it('accepts registration with the correct code', async () => {
    process.env.REGISTRATION_INVITE_CODE = 'secret-gate-code';
    const { config } = await import('../src/config/env.js');
    (config as { registrationInviteCode?: string }).registrationInviteCode = 'secret-gate-code';
    try {
      const res = await request(ctx.app).post('/api/auth/register').send({
        username: 'withinvite',
        email: 'withinvite@test.local',
        password: 'Passw0rdGate99',
        displayName: 'With Invite',
        inviteCode: 'secret-gate-code',
      });
      expect(res.status).toBe(201);
    } finally {
      (config as { registrationInviteCode?: string }).registrationInviteCode = ORIGINAL;
      process.env.REGISTRATION_INVITE_CODE = ORIGINAL;
    }
  });

  it('reports invite required while configured', async () => {
    process.env.REGISTRATION_INVITE_CODE = 'secret-gate-code';
    const { config } = await import('../src/config/env.js');
    (config as { registrationInviteCode?: string }).registrationInviteCode = 'secret-gate-code';
    try {
      const res = await request(ctx.app).get('/api/auth/registration-config').expect(200);
      expect(res.body.data.inviteRequired).toBe(true);
    } finally {
      (config as { registrationInviteCode?: string }).registrationInviteCode = ORIGINAL;
      process.env.REGISTRATION_INVITE_CODE = ORIGINAL;
    }
  });
});
