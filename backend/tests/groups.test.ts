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

async function makeGroup(ownerUsername: string) {
  const owner = await ctx.registerUser(ownerUsername);
  const res = await owner.agent.post('/api/groups').send({ name: `Group ${ownerUsername}`, isPrivate: true });
  const groupId = res.body.data.id as string;
  return { owner, groupId };
}

describe('group lifecycle', () => {
  it('creates a group with the creator as owner', async () => {
    const { owner, groupId } = await makeGroup('owner1');
    const res = await owner.agent.get(`/api/groups/${groupId}`).expect(200);
    expect(res.body.data.viewerRole).toBe('owner');
    expect(res.body.data.isPrivate).toBe(true);
  });

  it('blocks non-members from viewing private groups (IDOR)', async () => {
    const { groupId } = await makeGroup('private_owner');
    const outsider = await ctx.registerUser('outsider1');
    const res = await outsider.agent.get(`/api/groups/${groupId}`);
    expect(res.status).toBe(403);
  });

  it('allows joining public groups but not private ones', async () => {
    const owner = await ctx.registerUser('pub_owner');
    const created = await owner.agent.post('/api/groups').send({ name: 'Public Crew', isPrivate: false });
    const publicId = created.body.data.id as string;

    const joiner = await ctx.registerUser('pub_joiner');
    await joiner.agent.post(`/api/groups/${publicId}/join`).expect(200);

    // private group
    const { groupId: privateId } = await makeGroup('priv_owner2');
    const denied = await joiner.agent.post(`/api/groups/${privateId}/join`);
    expect(denied.status).toBe(403);
  });

  it('only the owner can update and delete the group', async () => {
    const { owner, groupId } = await makeGroup('upd_owner');
    const member = await ctx.registerUser('upd_member');
    // member can't even see it; test with a public group instead
    const publicGroup = await owner.agent.post('/api/groups').send({ name: 'PermCheck', isPrivate: false });
    const pubId = publicGroup.body.data.id as string;
    await member.agent.post(`/api/groups/${pubId}/join`).expect(200);

    const denied = await member.agent.patch(`/api/groups/${pubId}`).send({ name: 'Hacked!' });
    expect(denied.status).toBe(403);

    const deniedDelete = await member.agent.delete(`/api/groups/${pubId}`);
    expect(deniedDelete.status).toBe(403);

    const allowed = await owner.agent.patch(`/api/groups/${pubId}`).send({ description: 'Updated by owner' });
    expect(allowed.status).toBe(200);

    void groupId;
  });

  it('owners cannot leave their own group', async () => {
    const { owner, groupId } = await makeGroup('leave_owner');
    const res = await owner.agent.post(`/api/groups/${groupId}/leave`);
    expect(res.status).toBe(400);
  });

  it('moderators cannot remove other moderators; owner can remove anyone', async () => {
    const { owner, groupId } = await makeGroup('mod_owner');
    const mod = await ctx.registerUser('mod_user');
    const mod2 = await ctx.registerUser('mod_user2');
    const member = await ctx.registerUser('plain_member');

    // invite members via code (owner shares it)
    const g = await owner.agent.get(`/api/groups/${groupId}`);
    const code = g.body.data.id ? undefined : undefined; // code not exposed via API — join via friend invite instead
    void code;

    // add members through direct invite endpoint using friend relation; simpler: use invite code from DB via owner rotate
    const rotated = await owner.agent.post(`/api/groups/${groupId}/rotate-invite`).expect(200);
    const inviteCode = rotated.body.data.code as string;
    await mod.agent.post('/api/groups/join').send({ code: inviteCode }).expect(200);
    await mod2.agent.post('/api/groups/join').send({ code: inviteCode }).expect(200);
    await member.agent.post('/api/groups/join').send({ code: inviteCode }).expect(200);

    // promote mod
    await owner.agent.post(`/api/groups/${groupId}/members/${mod.id}/role`).send({ role: 'moderator' }).expect(200);

    // moderator removes a plain member: OK
    await mod.agent.post(`/api/groups/${groupId}/members/${member.id}/remove`).expect(200);

    // promote mod2 as well so moderator-vs-moderator rules apply
    await owner.agent.post(`/api/groups/${groupId}/members/${mod2.id}/role`).send({ role: 'moderator' }).expect(200);

    // moderator cannot remove another moderator
    const denied = await mod.agent.post(`/api/groups/${groupId}/members/${mod2.id}/remove`);
    expect(denied.status).toBe(403);

    // owner removes a moderator: OK
    await owner.agent.post(`/api/groups/${groupId}/members/${mod.id}/remove`).expect(200);

    // nobody removes the owner
    const deny2 = await mod2.agent.post(`/api/groups/${groupId}/members/${owner.id}/remove`);
    expect(deny2.status).toBe(403);
  });
});

describe('announcements', () => {
  it('members cannot create announcements; moderators can; members get notifications', async () => {
    const { owner, groupId } = await makeGroup('ann_owner');
    const mod = await ctx.registerUser('ann_mod');
    const member = await ctx.registerUser('ann_member');

    const rotated = await owner.agent.post(`/api/groups/${groupId}/rotate-invite`).expect(200);
    const code = rotated.body.data.code as string;
    await mod.agent.post('/api/groups/join').send({ code }).expect(200);
    await member.agent.post('/api/groups/join').send({ code }).expect(200);

    const denied = await member.agent.post(`/api/groups/${groupId}/announcements`).send({ title: 'Nope', body: 'member attempt' });
    expect(denied.status).toBe(403);

    await owner.agent.post(`/api/groups/${groupId}/members/${mod.id}/role`).send({ role: 'moderator' }).expect(200);
    const ok = await mod.agent.post(`/api/groups/${groupId}/announcements`).send({ title: 'Big news', body: 'Party at the construct.' });
    expect(ok.status).toBe(201);

    // member received a notification
    const notifs = await member.agent.get('/api/notifications?limit=10').expect(200);
    const announcement = (notifs.body.data.items as { type: string }[]).find((n) => n.type === 'announcement');
    expect(announcement).toBeTruthy();
  });
});

describe('group feed privacy', () => {
  it('outsiders cannot read a private group feed', async () => {
    const { owner, groupId } = await makeGroup('feed_owner');
    await owner.agent.post('/api/feed').send({ content: 'Secret plans', groupId });
    const outsider = await ctx.registerUser('feed_outsider');
    const res = await outsider.agent.get(`/api/feed/groups/${groupId}`);
    expect(res.status).toBe(403);
  });
});
