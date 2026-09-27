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

async function makeFriends(aName: string, bName: string) {
  const a = await ctx.registerUser(aName);
  const b = await ctx.registerUser(bName);
  await a.agent.post('/api/friends/requests').send({ userId: b.id });
  const reqs = await b.agent.get('/api/friends/requests');
  const requestId = (reqs.body.data.incoming as { id: string }[])[0]!.id;
  await b.agent.post(`/api/friends/requests/${requestId}/accept`);
  return { a, b };
}

describe('chat security', () => {
  it('friends can DM; strangers cannot', async () => {
    const { a, b } = await makeFriends('dm_a', 'dm_b');
    const conv = await a.agent.post('/api/chat/dm').send({ userId: b.id }).expect(201);
    const convId = conv.body.data.id as string;

    const stranger = await ctx.registerUser('dm_stranger');
    const denied = await stranger.agent.get(`/api/chat/${convId}/messages`);
    expect(denied.status).toBe(403);

    const messages = await a.agent.get(`/api/chat/${convId}/messages`).expect(200);
    expect(messages.body.data.items).toHaveLength(0);
  });

  it('cannot DM yourself or a non-friend', async () => {
    const a = await ctx.registerUser('self_dm');
    const res = await a.agent.post('/api/chat/dm').send({ userId: a.id });
    expect(res.status).toBe(400);

    const stranger = await ctx.registerUser('not_friend_yet');
    const res2 = await a.agent.post('/api/chat/dm').send({ userId: stranger.id });
    expect(res2.status).toBe(403);
  });

  it('editing someone else’s message is forbidden', async () => {
    const { a, b } = await makeFriends('edit_a', 'edit_b');
    // send via REST-equivalent: use gateway service through socket? Use service directly via chat service import.
    const conv = await a.agent.post('/api/chat/dm').send({ userId: b.id }).expect(201);
    const convId = conv.body.data.id as string;

    // Seed a message through the service layer (same code the gateway uses).
    const { sendMessage } = await import('../src/services/chat.service.js');
    const msg = sendMessage(a.id, convId, 'original text');

    const denied = await b.agent.patch(`/api/chat/messages/${msg.id}`).send({ content: 'hacked' });
    expect(denied.status).toBe(403);

    const ok = await a.agent.patch(`/api/chat/messages/${msg.id}`).send({ content: 'edited text' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.content).toBe('edited text');
    expect(ok.body.data.edited).toBe(true);
  });

  it('read state updates unread counts', async () => {
    const { a, b } = await makeFriends('read_a', 'read_b');
    const conv = await a.agent.post('/api/chat/dm').send({ userId: b.id }).expect(201);
    const convId = conv.body.data.id as string;
    const { sendMessage } = await import('../src/services/chat.service.js');
    sendMessage(a.id, convId, 'hey, unread!');

    const convList = await b.agent.get('/api/chat?limit=50').expect(200);
    const target = (convList.body.data.items as { id: string; unreadCount: number }[]).find((c) => c.id === convId);
    expect(target?.unreadCount).toBe(1);

    await b.agent.post(`/api/chat/${convId}/read`).expect(200);
    const convList2 = await b.agent.get('/api/chat?limit=50').expect(200);
    const target2 = (convList2.body.data.items as { id: string; unreadCount: number }[]).find((c) => c.id === convId);
    expect(target2?.unreadCount).toBe(0);
  });
});

describe('events', () => {
  it('creates an event, RSVPs, and notifies the creator', async () => {
    const { a, b } = await makeFriends('ev_a', 'ev_b');
    const created = await a.agent.post('/api/events').send({
      title: 'Movie night',
      date: '2030-01-01',
      startTime: '20:00',
      location: 'The commons',
    });
    expect(created.status).toBe(201);
    const eventId = created.body.data.id as string;

    await b.agent.post(`/api/events/${eventId}/rsvp`).send({ response: 'going' }).expect(200);
    const fetched = await a.agent.get(`/api/events/${eventId}`).expect(200);
    expect(fetched.body.data.attendees.going).toBe(2); // creator auto-going + b

    // creator was notified of b's RSVP
    const notifs = await a.agent.get('/api/notifications?limit=10').expect(200);
    const rsvpNotif = (notifs.body.data.items as { type: string }[]).find((n) => n.type === 'event');
    expect(rsvpNotif).toBeTruthy();

    // stranger cannot see the event
    const stranger = await ctx.registerUser('ev_stranger');
    const denied = await stranger.agent.get(`/api/events/${eventId}`);
    expect(denied.status).toBe(403);
  });
});

describe('feed and posts', () => {
  it('creates a post, comments, reacts', async () => {
    const { a, b } = await makeFriends('post_a', 'post_b');
    const post = await a.agent.post('/api/feed').send({ content: 'Hello HollowLink!' }).expect(201);
    const postId = post.body.data.id as string;

    await b.agent.post(`/api/feed/posts/${postId}/comments`).send({ content: 'Hi!' }).expect(201);
    await b.agent.post('/api/feed/reactions').send({ targetType: 'post', targetId: postId, emoji: '🔥' }).expect(200);

    const fetched = await a.agent.get(`/api/feed/posts/${postId}`).expect(200);
    expect(fetched.body.data.commentCount).toBe(1);
    expect(fetched.body.data.reactions[0]!.count).toBe(1);

    // a got notified about the comment and the reaction
    const notifs = await a.agent.get('/api/notifications?limit=20').expect(200);
    const types = (notifs.body.data.items as { type: string }[]).map((n) => n.type);
    expect(types).toContain('comment');
    expect(types).toContain('reaction');
  });

  it('strangers cannot view friends-only posts', async () => {
    const a = await ctx.registerUser('vis_a');
    const post = await a.agent.post('/api/feed').send({ content: 'Friends only secret' }).expect(201);
    const postId = post.body.data.id as string;
    const stranger = await ctx.registerUser('vis_stranger');
    const res = await stranger.agent.get(`/api/feed/posts/${postId}`);
    expect(res.status).toBe(403);
  });

  it('rejects invalid emoji reactions', async () => {
    const a = await ctx.registerUser('emoji_a');
    const post = await a.agent.post('/api/feed').send({ content: 'react to me' }).expect(201);
    const res = await a.agent.post('/api/feed/reactions').send({ targetType: 'post', targetId: post.body.data.id, emoji: '💩' });
    expect(res.status).toBe(400);
  });

  it('paginates the home feed', async () => {
    const a = await ctx.registerUser('pager');
    for (let i = 0; i < 15; i++) {
      await a.agent.post('/api/feed').send({ content: `post ${i}` });
    }
    const page1 = await a.agent.get('/api/feed?limit=10&offset=0').expect(200);
    const page2 = await a.agent.get('/api/feed?limit=10&offset=10').expect(200);
    expect(page1.body.data.items).toHaveLength(10);
    expect(page2.body.data.items).toHaveLength(5);
    expect(page1.body.data.total).toBe(15);
  });
});

describe('reports', () => {
  it('files a report and blocks non-admin moderation', async () => {
    const { a } = await makeFriends('rep_a', 'rep_b');
    const post = await a.agent.post('/api/feed').send({ content: 'reportable' }).expect(201);
    const filed = await a.agent.post('/api/reports').send({ targetType: 'post', targetId: post.body.data.id, reason: 'spam' });
    expect(filed.status).toBe(201);

    const mine = await a.agent.get('/api/reports/mine').expect(200);
    expect(mine.body.data.items).toHaveLength(1);

    // admin endpoints denied for normal users
    const denied = await a.agent.get('/api/reports');
    expect(denied.status).toBe(403);
  });

  it('rejects reports against nonexistent targets', async () => {
    const a = await ctx.registerUser('rep_ghost');
    const res = await a.agent.post('/api/reports').send({ targetType: 'post', targetId: 'no-such-post', reason: 'spam' });
    expect(res.status).toBe(404);
  });
});

describe('authorization basics', () => {
  it('rejects unauthenticated access to protected endpoints', async () => {
    await request(ctx.app).get('/api/feed').expect(401);
    await request(ctx.app).get('/api/groups').expect(401);
    await request(ctx.app).get('/api/chat').expect(401);
    await request(ctx.app).get('/api/events').expect(401);
    await request(ctx.app).get('/api/notifications').expect(401);
  });

  it('rejects invalid JWTs', async () => {
    await request(ctx.app).get('/api/auth/me').set('Authorization', 'Bearer not.a.jwt').expect(401);
  });
});
