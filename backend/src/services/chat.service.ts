import { getDb } from '../db/connection.js';
import { uuid, transaction } from '../lib/crypto.js';
import { ApiError } from '../lib/apiError.js';
import { getMemberRow, getGroupOrThrow } from './groups.service.js';
import { areFriends } from './users.service.js';
import type { Page } from '../lib/pagination.js';

export interface PublicMessage {
  id: string;
  conversationId: string;
  author: { id: string; username: string; displayName: string; avatarUrl: string | null };
  content: string;
  replyTo: { id: string; authorName: string; content: string } | null;
  reactions: { emoji: string; count: number; reacted: boolean }[];
  createdAt: string;
  edited: boolean;
  deleted: boolean;
}

export interface PublicConversation {
  id: string;
  kind: 'dm' | 'group';
  title: string | null;
  group: { id: string; name: string; iconUrl: string | null } | null;
  members: { id: string; username: string; displayName: string; avatarUrl: string | null; lastReadAt: string | null }[];
  lastMessage: { id: string; content: string; authorId: string; createdAt: string } | null;
  unreadCount: number;
  createdAt: string;
}

function authorOf(userId: string): { id: string; username: string; displayName: string; avatarUrl: string | null } {
  const row = getDb().prepare('SELECT id, username, display_name, avatar_url FROM users WHERE id = ?').get(userId) as
    | { id: string; username: string; display_name: string; avatar_url: string | null }
    | undefined;
  if (!row) return { id: userId, username: 'unknown', displayName: 'Unknown', avatarUrl: null };
  return { id: row.id, username: row.username, displayName: row.display_name, avatarUrl: row.avatar_url };
}

/** Authorization core: only members may access a conversation. Guessing IDs gets you nowhere. */
export function requireConversationMember(conversationId: string, userId: string): void {
  const member = getDb()
    .prepare('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?')
    .get(conversationId, userId);
  if (!member) throw ApiError.forbidden('You do not have access to this conversation');
}

function getConversationRow(conversationId: string): Record<string, unknown> {
  const row = getDb().prepare('SELECT * FROM conversations WHERE id = ?').get(conversationId) as
    | Record<string, unknown>
    | undefined;
  if (!row) throw ApiError.notFound('Conversation not found');
  return row;
}

function getGroupConversation(groupId: string): Record<string, unknown> | undefined {
  return getDb().prepare(`SELECT * FROM conversations WHERE group_id = ? AND kind = 'group'`).get(groupId) as
    | Record<string, unknown>
    | undefined;
}

function ensureGroupConversation(groupId: string, actorId: string): Record<string, unknown> {
  const db = getDb();
  getGroupOrThrow(groupId); // 404 if the group does not exist
  if (!getMemberRow(groupId, actorId)) throw ApiError.forbidden('You are not a member of this group');
  let conv = getGroupConversation(groupId);
  if (!conv) {
    const id = uuid();
    db.prepare(
      `INSERT INTO conversations (id, kind, group_id, title, created_by, created_at) VALUES (?, 'group', ?, NULL, ?, ?)`,
    ).run(id, groupId, actorId, new Date().toISOString());
    conv = getGroupConversation(groupId)!;
  }
  // Keep membership in sync with group membership.
  const memberRows = db.prepare('SELECT user_id FROM group_members WHERE group_id = ?').all(groupId) as { user_id: string }[];
  for (const m of memberRows) {
    db.prepare('INSERT OR IGNORE INTO conversation_members (id, conversation_id, user_id, joined_at) VALUES (?, ?, ?, ?)').run(
      uuid(),
      conv.id as string,
      m.user_id,
      new Date().toISOString(),
    );
  }
  return conv;
}

function findDm(a: string, b: string): Record<string, unknown> | undefined {
  return getDb()
    .prepare(
      `SELECT c.* FROM conversations c
       WHERE c.kind = 'dm'
       AND EXISTS (SELECT 1 FROM conversation_members WHERE conversation_id = c.id AND user_id = ?)
       AND EXISTS (SELECT 1 FROM conversation_members WHERE conversation_id = c.id AND user_id = ?)
       AND (SELECT COUNT(*) FROM conversation_members WHERE conversation_id = c.id) = 2`,
    )
    .get(a, b) as Record<string, unknown> | undefined;
}

export function openDm(userId: string, otherUserId: string): PublicConversation {
  if (userId === otherUserId) throw ApiError.badRequest('You cannot open a DM with yourself');
  if (!areFriends(userId, otherUserId)) throw ApiError.forbidden('You can only message friends');
  const db = getDb();
  let conv = findDm(userId, otherUserId);
  if (!conv) {
    const id = uuid();
    const now = new Date().toISOString();
    transaction(() => {
      db.prepare(`INSERT INTO conversations (id, kind, group_id, title, created_by, created_at) VALUES (?, 'dm', NULL, NULL, ?, ?)`).run(
        id,
        userId,
        now,
      );
      db.prepare('INSERT INTO conversation_members (id, conversation_id, user_id, joined_at) VALUES (?, ?, ?, ?)').run(uuid(), id, userId, now);
      db.prepare('INSERT INTO conversation_members (id, conversation_id, user_id, joined_at) VALUES (?, ?, ?, ?)').run(uuid(), id, otherUserId, now);
    });
    conv = getConversationRow(id);
  }
  return decorateConversation(conv, userId);
}

export function getGroupChat(userId: string, groupId: string): PublicConversation {
  const conv = ensureGroupConversation(groupId, userId);
  return decorateConversation(conv, userId);
}

export function getConversation(userId: string, conversationId: string): PublicConversation {
  requireConversationMember(conversationId, userId);
  return decorateConversation(getConversationRow(conversationId), userId);
}

export function listConversations(userId: string, page: Page): { items: PublicConversation[]; total: number } {
  const db = getDb();
  const total = (
    db.prepare('SELECT COUNT(*) AS c FROM conversation_members WHERE user_id = ?').get(userId) as { c: number }
  ).c;
  const convIds = db
    .prepare(
      `SELECT c.id FROM conversations c JOIN conversation_members m ON m.conversation_id = c.id
       WHERE m.user_id = ? ORDER BY COALESCE(c.last_message_at, c.created_at) DESC LIMIT ? OFFSET ?`,
    )
    .all(userId, page.limit, page.offset) as { id: string }[];
  return {
    items: convIds.map((r) => decorateConversation(getConversationRow(r.id), userId)),
    total,
  };
}

function decorateConversation(conv: Record<string, unknown>, viewerId: string): PublicConversation {
  const db = getDb();
  const conversationId = conv.id as string;
  const members = db
    .prepare(
      `SELECT m.user_id, m.last_read_at, u.username, u.display_name, u.avatar_url
       FROM conversation_members m JOIN users u ON u.id = m.user_id
       WHERE m.conversation_id = ?`,
    )
    .all(conversationId) as { user_id: string; last_read_at: string | null; username: string; display_name: string; avatar_url: string | null }[];
  const lastMessage = db
    .prepare(
      `SELECT id, content, author_id, created_at FROM messages WHERE conversation_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`,
    )
    .get(conversationId) as { id: string; content: string; author_id: string; created_at: string } | undefined;
  const viewerMember = members.find((m) => m.user_id === viewerId);
  const unreadCount = (
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM messages WHERE conversation_id = ? AND deleted_at IS NULL
         AND author_id != ? AND created_at > COALESCE(?, '1970-01-01T00:00:00.000Z')`,
      )
      .get(conversationId, viewerId, viewerMember?.last_read_at ?? null) as { c: number }
  ).c;

  const kind = conv.kind as 'dm' | 'group';
  let group: PublicConversation['group'] = null;
  const groupIdVal = conv.group_id as string | null;
  if (kind === 'group' && groupIdVal) {
    const g = getDb().prepare('SELECT id, name, icon_url FROM groups WHERE id = ?').get(groupIdVal) as
      | { id: string; name: string; icon_url: string | null }
      | undefined;
    if (g) group = { id: g.id, name: g.name, iconUrl: g.icon_url };
  }

  return {
    id: conversationId,
    kind,
    title: (conv.title as string | null) ?? null,
    group,
    members: members.map((m) => ({
      id: m.user_id,
      username: m.username,
      displayName: m.display_name,
      avatarUrl: m.avatar_url,
      lastReadAt: m.last_read_at,
    })),
    lastMessage: lastMessage
      ? { id: lastMessage.id, content: lastMessage.content, authorId: lastMessage.author_id, createdAt: lastMessage.created_at }
      : null,
    unreadCount,
    createdAt: conv.created_at as string,
  };
}

function decorateMessage(row: Record<string, unknown>, viewerId: string | undefined): PublicMessage {
  const db = getDb();
  const messageId = row.id as string;
  const reactionRows = db
    .prepare(
      `SELECT emoji, COUNT(*) AS count, SUM(CASE WHEN user_id = ? THEN 1 ELSE 0 END) AS reacted
       FROM message_reactions WHERE message_id = ? GROUP BY emoji ORDER BY count DESC`,
    )
    .all(viewerId ?? '', messageId) as { emoji: string; count: number; reacted: number | null }[];
  const replyToId = row.reply_to_id as string | null;
  let replyTo: PublicMessage['replyTo'] = null;
  if (replyToId) {
    const r = db
      .prepare(
        `SELECT m.content, u.display_name FROM messages m JOIN users u ON u.id = m.author_id WHERE m.id = ?`,
      )
      .get(replyToId) as { content: string; display_name: string } | undefined;
    if (r) replyTo = { id: replyToId, authorName: r.display_name, content: r.content.slice(0, 120) };
  }
  return {
    id: messageId,
    conversationId: row.conversation_id as string,
    author: authorOf(row.author_id as string),
    content: row.deleted_at ? 'Message deleted' : (row.content as string),
    replyTo,
    reactions: reactionRows.map((r) => ({ emoji: r.emoji, count: r.count, reacted: Boolean(r.reacted) })),
    createdAt: row.created_at as string,
    edited: row.updated_at !== row.created_at,
    deleted: Boolean(row.deleted_at),
  };
}

export function listMessages(viewerId: string, conversationId: string, page: Page): { items: PublicMessage[]; total: number } {
  requireConversationMember(conversationId, viewerId);
  const db = getDb();
  const total = (
    db.prepare('SELECT COUNT(*) AS c FROM messages WHERE conversation_id = ? AND deleted_at IS NULL').get(conversationId) as { c: number }
  ).c;
  const rows = db
    .prepare(
      `SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    )
    .all(conversationId, page.limit, page.offset) as Record<string, unknown>[];
  return { items: rows.map((r) => decorateMessage(r, viewerId)).reverse(), total };
}

export function sendMessage(
  authorId: string,
  conversationId: string,
  content: string,
  replyToId?: string | null,
): PublicMessage {
  requireConversationMember(conversationId, authorId);
  if (replyToId) {
    const parent = getDb().prepare('SELECT 1 FROM messages WHERE id = ? AND conversation_id = ?').get(replyToId, conversationId);
    if (!parent) throw ApiError.badRequest('Reply target must be in the same conversation');
  }
  const id = uuid();
  const now = new Date().toISOString();
  const db = getDb();
  transaction(() => {
    db.prepare(
      'INSERT INTO messages (id, conversation_id, author_id, content, reply_to_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(id, conversationId, authorId, content, replyToId ?? null, now, now);
    db.prepare('UPDATE conversations SET last_message_at = ? WHERE id = ?').run(now, conversationId);
  });
  return decorateMessage(getDb().prepare('SELECT * FROM messages WHERE id = ?').get(id) as Record<string, unknown>, authorId);
}

export function editMessage(userId: string, messageId: string, content: string): PublicMessage {
  const row = getDb().prepare('SELECT * FROM messages WHERE id = ?').get(messageId) as Record<string, unknown> | undefined;
  if (!row) throw ApiError.notFound('Message not found');
  if (row.author_id !== userId) throw ApiError.forbidden('You can only edit your own messages');
  if (row.deleted_at) throw ApiError.badRequest('Message was deleted');
  getDb().prepare('UPDATE messages SET content = ?, updated_at = ? WHERE id = ?').run(content, new Date().toISOString(), messageId);
  return decorateMessage(getDb().prepare('SELECT * FROM messages WHERE id = ?').get(messageId) as Record<string, unknown>, userId);
}

export function deleteMessage(userId: string, messageId: string): void {
  const row = getDb().prepare('SELECT * FROM messages WHERE id = ?').get(messageId) as Record<string, unknown> | undefined;
  if (!row) throw ApiError.notFound('Message not found');
  if (row.author_id !== userId) throw ApiError.forbidden('You can only delete your own messages');
  getDb().prepare('UPDATE messages SET deleted_at = ?, content = ? WHERE id = ?').run(new Date().toISOString(), '', messageId);
}

export function reactToMessage(userId: string, messageId: string, emoji: string): void {
  const row = getDb().prepare('SELECT * FROM messages WHERE id = ?').get(messageId) as Record<string, unknown> | undefined;
  if (!row) throw ApiError.notFound('Message not found');
  requireConversationMember(row.conversation_id as string, userId);
  const db = getDb();
  const existing = db
    .prepare('SELECT id FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?')
    .get(messageId, userId, emoji);
  if (existing) {
    db.prepare('DELETE FROM message_reactions WHERE id = ?').run((existing as { id: string }).id);
    return;
  }
  db.prepare('INSERT INTO message_reactions (id, message_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?, ?)').run(
    uuid(),
    messageId,
    userId,
    emoji,
    new Date().toISOString(),
  );
}

export function markRead(userId: string, conversationId: string): void {
  requireConversationMember(conversationId, userId);
  getDb()
    .prepare('UPDATE conversation_members SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?')
    .run(new Date().toISOString(), conversationId, userId);
}

export function typingPayload(conversationId: string, userId: string): { conversationId: string; userId: string } {
  return { conversationId, userId };
}
