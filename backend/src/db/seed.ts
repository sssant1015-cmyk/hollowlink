import { closeDb, getDb } from './connection.js';
import { runMigrations } from './migrate.js';
import { createUser } from '../services/users.service.js';
import { uuid, randomToken } from '../lib/crypto.js';

function iso(daysAgo = 0): string {
  return new Date(Date.now() - daysAgo * 86_400_000).toISOString();
}

function dateIn(daysAhead: number): string {
  return new Date(Date.now() + daysAhead * 86_400_000).toISOString().slice(0, 10);
}

runMigrations();
const db = getDb();

const count = (db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c;
if (count > 0) {
  console.log('Database already has users — skipping seed (delete the DB file to re-seed).');
  closeDb();
  process.exit(0);
}

const DEMO_PASSWORD = 'hollowlink-demo';

const people = [
  { username: 'neo', displayName: 'Neo', email: 'neo@hollowlink.local', bio: 'Looking for the white rabbit. 🐇', pronouns: 'he/him', location: 'Matrix' },
  { username: 'trinity', displayName: 'Trinity', email: 'trinity@hollowlink.local', bio: 'Jump program enthusiast.', pronouns: 'she/her', location: 'Matrix' },
  { username: 'morpheus', displayName: 'Morpheus', email: 'morpheus@hollowlink.local', bio: 'What if I told you this was a demo seed?', pronouns: 'he/him', location: 'Zion' },
  { username: 'mouse', displayName: 'Mouse', email: 'mouse@hollowlink.local', bio: 'Woman in the red dress designer.', pronouns: null, location: 'Construct' },
  { username: 'tank', displayName: 'Tank', email: 'tank@hollowlink.local', bio: 'Operator. Loading programs.', pronouns: null, location: 'Hovercraft' },
  { username: 'cypher', displayName: 'Cypher', email: 'cypher@hollowlink.local', bio: 'Ignorance is bliss.', pronouns: null, location: '?' },
] as const;

console.log('Seeding users…');
const users = people.map((p) => createUser({ username: p.username, email: p.email, password: DEMO_PASSWORD, displayName: p.displayName }));
for (const [i, p] of people.entries()) {
  db.prepare('UPDATE users SET bio = ?, pronouns = ?, location = ?, created_at = ?, updated_at = ? WHERE id = ?').run(
    p.bio,
    p.pronouns,
    p.location,
    iso(60 - i * 5),
    iso(1),
    users[i].id,
  );
}

const [neo, trinity, morpheus, mouse, tank, cypher] = users.map((u) => u.id);

console.log('Seeding friendships…');
const friendPairs: [string, string][] = [
  [neo, trinity],
  [neo, morpheus],
  [neo, tank],
  [trinity, morpheus],
  [trinity, tank],
  [morpheus, tank],
  [morpheus, mouse],
];
for (const [a, b] of friendPairs) {
  db.prepare('INSERT INTO friendships (id, user_id, friend_id, created_at) VALUES (?, ?, ?, ?)').run(uuid(), a, b, iso(30));
  db.prepare('INSERT INTO friendships (id, user_id, friend_id, created_at) VALUES (?, ?, ?, ?)').run(uuid(), b, a, iso(30));
}

console.log('Seeding group…');
const groupId = uuid();
db.prepare(
  `INSERT INTO groups (id, name, description, icon_url, banner_url, is_private, invite_code, owner_id, created_at, updated_at)
   VALUES (?, ?, ?, NULL, NULL, 0, ?, ?, ?, ?)`,
).run(groupId, 'Zion Council', 'The human defense council. All operators welcome.', randomToken(8), morpheus, iso(45), iso(5));
for (const [uid, role] of [
  [morpheus, 'owner'],
  [neo, 'moderator'],
  [trinity, 'member'],
  [tank, 'member'],
  [mouse, 'member'],
  [cypher, 'member'],
] as const) {
  db.prepare('INSERT INTO group_members (id, group_id, user_id, role, joined_at) VALUES (?, ?, ?, ?, ?)').run(uuid(), groupId, uid, role, iso(40));
}

console.log('Seeding posts…');
const posts = [
  { author: morpheus, content: 'Welcome to the Zion Council channel. Be excellent to each other.', group: groupId, days: 20 },
  { author: neo, content: 'Just dodged a spoon in the training program. NBD.', group: groupId, days: 12 },
  { author: trinity, content: 'Rooftop run at sunset — who is in?', group: null, days: 6 },
  { author: tank, content: 'Loaded the jump program 12 times today. My job is basically cheat codes.', group: groupId, days: 3 },
  { author: mouse, content: 'New construct design dropped. The red dress is *optional* this time.', group: groupId, days: 1 },
];
const postIds: string[] = [];
for (const p of posts) {
  const pid = uuid();
  postIds.push(pid);
  db.prepare('INSERT INTO posts (id, author_id, group_id, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    pid,
    p.author,
    p.group,
    p.content,
    iso(p.days),
    iso(p.days),
  );
}

console.log('Seeding reactions & comments…');
db.prepare('INSERT INTO reactions (id, user_id, target_type, target_id, emoji, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(uuid(), neo, 'post', postIds[0], '🔥', iso(19));
db.prepare('INSERT INTO reactions (id, user_id, target_type, target_id, emoji, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(uuid(), trinity, 'post', postIds[0], '🔥', iso(19));
db.prepare('INSERT INTO reactions (id, user_id, target_type, target_id, emoji, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(uuid(), mouse, 'post', postIds[0], '👍', iso(18));
db.prepare('INSERT INTO comments (id, post_id, author_id, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(uuid(), postIds[1], trinity, 'There is no spoon. 🥄', iso(11), iso(11));
db.prepare('INSERT INTO comments (id, post_id, author_id, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(uuid(), postIds[1], morpheus, 'Show me.', iso(11), iso(11));

console.log('Seeding events & announcements…');
db.prepare(
  `INSERT INTO events (id, title, description, group_id, creator_id, date, start_time, end_time, location, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
).run(uuid(), 'Council Briefing', 'Monthly sync on sentinel activity.', groupId, morpheus, dateIn(3), '18:00', '19:30', 'Broadcast Depth', iso(4), iso(4));
db.prepare(
  `INSERT INTO events (id, title, description, group_id, creator_id, date, start_time, end_time, location, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
).run(uuid(), 'Jump Program Practice', 'Bring your best wall-running form.', groupId, neo, dateIn(7), '14:00', null, 'Construct', iso(2), iso(2));
db.prepare(
  `INSERT INTO announcements (id, group_id, author_id, title, body, image_url, pinned, created_at) VALUES (?, ?, ?, ?, ?, NULL, 1, ?)`,
).run(uuid(), groupId, morpheus, 'New broadcast hours', 'Effective this cycle: the broadcast depth rotates every 72 hours. Check the pin before going offline.', iso(8));

console.log('Seeding DMs…');
function dmConversation(a: string, b: string): string {
  const cid = uuid();
  const now = iso(0);
  db.prepare(`INSERT INTO conversations (id, kind, group_id, title, created_by, created_at) VALUES (?, 'dm', NULL, NULL, ?, ?)`).run(cid, a, now);
  db.prepare('INSERT INTO conversation_members (id, conversation_id, user_id, joined_at) VALUES (?, ?, ?, ?)').run(uuid(), cid, a, now);
  db.prepare('INSERT INTO conversation_members (id, conversation_id, user_id, joined_at) VALUES (?, ?, ?, ?)').run(uuid(), cid, b, now);
  return cid;
}
const dmNeoTrin = dmConversation(neo, trinity);
const dms: [string, string, string, number][] = [
  [neo, trinity, 'The Oracle wants to see us tomorrow.', 2],
  [trinity, neo, 'I will be there. Bring the good coffee.', 2],
  [neo, trinity, 'Deal. ☕', 2],
  [neo, morpheus, 'Training at 14:00?', 1],
  [morpheus, neo, 'Already loaded. See you in the construct.', 1],
];
for (const [a, , content, days] of dms) {
  db.prepare(
    'INSERT INTO messages (id, conversation_id, author_id, content, reply_to_id, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, ?, ?)',
  ).run(uuid(), dmNeoTrin, a, content, iso(days), iso(days));
  db.prepare('UPDATE conversations SET last_message_at = ? WHERE id = ?').run(iso(days), dmNeoTrin);
}

console.log('Seeding notifications…');
db.prepare(
  `INSERT INTO notifications (id, user_id, type, actor_id, entity_type, entity_id, title, body, read_at, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
).run(uuid(), neo, 'friend_accepted', trinity, 'user', trinity, 'Friend request accepted', 'trinity accepted your friend request', iso(1));
db.prepare(
  `INSERT INTO notifications (id, user_id, type, actor_id, entity_type, entity_id, title, body, read_at, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
).run(uuid(), neo, 'announcement', morpheus, 'group', groupId, 'Announcement in Zion Council', 'New broadcast hours', iso(2), iso(8));

console.log(`\n✅ Seed complete. ${people.length} users, password for all: "${DEMO_PASSWORD}"`);
console.log(`   Try logging in as: ${people.map((p) => p.username).join(', ')}\n`);

closeDb();
