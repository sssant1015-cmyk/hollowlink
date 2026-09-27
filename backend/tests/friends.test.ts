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

describe('friend flow', () => {
  it('sends, accepts, and lists friends', async () => {
    const a = await ctx.registerUser('friend_a');
    const b = await ctx.registerUser('friend_b');

    const send = await a.agent.post('/api/friends/requests').send({ userId: b.id });
    expect(send.status).toBe(201);

    // duplicate send rejected
    const dup = await a.agent.post('/api/friends/requests').send({ userId: b.id });
    expect(dup.status).toBe(409);

    // find the request id from b's perspective
    const reqs = await b.agent.get('/api/friends/requests').expect(200);
    const incoming = reqs.body.data.incoming as { id: string; from: { id: string } }[];
    expect(incoming).toHaveLength(1);
    expect(incoming[0]!.from.id).toBe(a.id);

    const accept = await b.agent.post(`/api/friends/requests/${incoming[0]!.id}/accept`).expect(200);

    const list = await a.agent.get('/api/friends').expect(200);
    expect((list.body.data.items as { id: string }[]).map((f) => f.id)).toContain(b.id);

    void accept;
  });

  it('prevents self-friending', async () => {
    const a = await ctx.registerUser('loner');
    const res = await a.agent.post('/api/friends/requests').send({ userId: a.id });
    expect(res.status).toBe(400);
  });

  it('prevents accepting someone else’s request (IDOR)', async () => {
    const a = await ctx.registerUser('idor_a');
    const b = await ctx.registerUser('idor_b');
    const c = await ctx.registerUser('idor_c');

    await a.agent.post('/api/friends/requests').send({ userId: b.id });
    const reqs = await b.agent.get('/api/friends/requests');
    const requestId = (reqs.body.data.incoming as { id: string }[])[0]!.id;

    // c tries to accept a request addressed to b
    const res = await c.agent.post(`/api/friends/requests/${requestId}/accept`);
    expect(res.status).toBe(404);
  });

  it('requires authentication', async () => {
    await request(ctx.app).get('/api/friends').expect(401);
  });
});

describe('blocking', () => {
  it('blocks and removes friendship both ways; blocked user cannot re-request', async () => {
    const a = await ctx.registerUser('blocker');
    const b = await ctx.registerUser('blockee');

    await a.agent.post('/api/friends/requests').send({ userId: b.id });
    const reqs = await b.agent.get('/api/friends/requests');
    const requestId = (reqs.body.data.incoming as { id: string }[])[0]!.id;
    await b.agent.post(`/api/friends/requests/${requestId}/accept`);

    await a.agent.post(`/api/friends/${b.id}/block`).expect(200);

    const list = await a.agent.get('/api/friends').expect(200);
    expect(list.body.data.items).toHaveLength(0);

    // blocked user cannot send a new request to the blocker
    const res = await b.agent.post('/api/friends/requests').send({ userId: a.id });
    expect(res.status).toBe(403);
  });

  it('blocked users are invisible in search for the blocker', async () => {
    const a = await ctx.registerUser('search_blocker');
    const b = await ctx.registerUser('search_blockee');
    await a.agent.post(`/api/friends/${b.id}/block`).expect(200);
    const res = await a.agent.get('/api/friends/search?q=search_blockee').expect(200);
    expect(res.body.data.items).toHaveLength(0);
  });
});

describe('unfriending', () => {
  it('removes the friendship', async () => {
    const a = await ctx.registerUser('unfriend_a');
    const b = await ctx.registerUser('unfriend_b');
    await a.agent.post('/api/friends/requests').send({ userId: b.id });
    const reqs = await b.agent.get('/api/friends/requests');
    const requestId = (reqs.body.data.incoming as { id: string }[])[0]!.id;
    await b.agent.post(`/api/friends/requests/${requestId}/accept`);
    await a.agent.delete(`/api/friends/${b.id}`).expect(200);
    const list = await a.agent.get('/api/friends').expect(200);
    expect(list.body.data.items).toHaveLength(0);
  });
});
