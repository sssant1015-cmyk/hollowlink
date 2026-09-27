import { getDb } from '../db/connection.js';
import { uuid, transaction } from '../lib/crypto.js';
import { ApiError } from '../lib/apiError.js';
import { areFriends } from './users.service.js';
import { getMemberRow, getGroupOrThrow } from './groups.service.js';
import { createNotification } from './notifications.service.js';
import type { Page } from '../lib/pagination.js';

export interface PostRow {
  id: string;
  author_id: string;
  group_id: string | null;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface PublicPost {
  id: string;
  author: { id: string; username: string; displayName: string; avatarUrl: string | null };
  groupId: string | null;
  content: string;
  media: { id: string; url: string; mediaType: string }[];
  reactions: { emoji: string; count: number; reacted: boolean }[];
  commentCount: number;
  createdAt: string;
  edited: boolean;
}

function authorOf(userId: string): { id: string; username: string; displayName: string; avatarUrl: string | null } {
  const row = getDb().prepare('SELECT id, username, display_name, avatar_url FROM users WHERE id = ?').get(userId) as
    | { id: string; username: string; display_name: string; avatar_url: string | null }
    | undefined;
  if (!row) return { id: userId, username: 'unknown', displayName: 'Unknown', avatarUrl: null };
  return { id: row.id, username: row.username, displayName: row.display_name, avatarUrl: row.avatar_url };
}

export function canViewPost(viewerId: string | undefined, post: PostRow): boolean {
  if (post.group_id === null) return true; // public post
  if (!viewerId) return false;
  return Boolean(getMemberRow(post.group_id, viewerId));
}

/** Who can see a feed post: author themself, their friends, or co-members of the post's group. */
export function assertCanViewPost(viewerId: string | undefined, post: PostRow): void {
  if (post.author_id === viewerId) return;
  if (post.group_id) {
    if (!viewerId || !getMemberRow(post.group_id, viewerId)) {
      throw ApiError.forbidden('You do not have access to this post');
    }
    return;
  }
  // Personal post: visible to the author's friends (and signed-in users via their own feed only).
  if (!viewerId || !areFriends(viewerId, post.author_id)) {
    throw ApiError.forbidden('You do not have access to this post');
  }
}

export interface CreatePostInput {
  content: string;
  groupId?: string | null;
  media?: { url: string; mediaType?: string }[];
}

export function createPost(authorId: string, input: CreatePostInput): PublicPost {
  const db = getDb();
  if (input.groupId) {
    const group = getGroupOrThrow(input.groupId);
    if (!getMemberRow(group.id, authorId)) throw ApiError.forbidden('You are not a member of this group');
  }
  const id = uuid();
  const now = new Date().toISOString();
  transaction(() => {
    db.prepare('INSERT INTO posts (id, author_id, group_id, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      id,
      authorId,
      input.groupId ?? null,
      input.content,
      now,
      now,
    );
    (input.media ?? []).forEach((m, i) => {
      db.prepare('INSERT INTO post_media (id, post_id, media_type, url, position) VALUES (?, ?, ?, ?, ?)').run(
        uuid(),
        id,
        m.mediaType ?? 'image',
        m.url,
        i,
      );
    });
  });
  return getPostOrThrow(authorId, id);
}

export function getPostOrThrow(viewerId: string | undefined, postId: string): PublicPost {
  const post = getDb().prepare('SELECT * FROM posts WHERE id = ?').get(postId) as PostRow | undefined;
  if (!post) throw ApiError.notFound('Post not found');
  assertCanViewPost(viewerId, post);
  return decoratePost(post, viewerId);
}

function decoratePost(post: PostRow, viewerId: string | undefined): PublicPost {
  const db = getDb();
  const media = db
    .prepare('SELECT id, url, media_type FROM post_media WHERE post_id = ? ORDER BY position')
    .all(post.id) as { id: string; url: string; media_type: string }[];
  const reactionRows = db
    .prepare(
      `SELECT emoji, COUNT(*) AS count,
        SUM(CASE WHEN user_id = ? THEN 1 ELSE 0 END) AS reacted
       FROM reactions WHERE target_type = 'post' AND target_id = ? GROUP BY emoji ORDER BY count DESC`,
    )
    .all(viewerId ?? '', post.id) as { emoji: string; count: number; reacted: number | null }[];
  const commentCount = (
    db.prepare('SELECT COUNT(*) AS c FROM comments WHERE post_id = ?').get(post.id) as { c: number }
  ).c;
  return {
    id: post.id,
    author: authorOf(post.author_id),
    groupId: post.group_id,
    content: post.content,
    media: media.map((m) => ({ id: m.id, url: m.url, mediaType: m.media_type })),
    reactions: reactionRows.map((r) => ({ emoji: r.emoji, count: r.count, reacted: Boolean(r.reacted) })),
    commentCount,
    createdAt: post.created_at,
    edited: post.updated_at !== post.created_at,
  };
}

/**
 * Home feed: posts by the viewer, their friends, and groups they belong to.
 * Cursor-free pagination via offset — fine at friend-group scale, indexed by created_at.
 */
export function homeFeed(viewerId: string, page: Page): { items: PublicPost[]; total: number } {
  const db = getDb();
  const params: Record<string, string | number> = { viewer: viewerId, limit: page.limit, offset: page.offset };
  const where = `
    (p.group_id IS NULL AND p.author_id = @viewer)
    OR (p.group_id IS NULL AND p.author_id IN (SELECT friend_id FROM friendships WHERE user_id = @viewer))
    OR (p.group_id IS NOT NULL AND p.group_id IN (SELECT group_id FROM group_members WHERE user_id = @viewer))
  `;
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM posts p WHERE ${where}`).get({ viewer: viewerId }) as { c: number }).c;
  const rows = db
    .prepare(`SELECT p.* FROM posts p WHERE ${where} ORDER BY p.created_at DESC LIMIT @limit OFFSET @offset`)
    .all(params) as unknown as PostRow[];
  return { items: rows.map((r) => decoratePost(r, viewerId)), total };
}

export function groupFeed(viewerId: string, groupId: string, page: Page): { items: PublicPost[]; total: number } {
  const group = getGroupOrThrow(groupId);
  if (!getMemberRow(group.id, viewerId)) throw ApiError.forbidden('You are not a member of this group');
  const db = getDb();
  const params = { groupId: group.id, limit: page.limit, offset: page.offset };
  const total = (db.prepare('SELECT COUNT(*) AS c FROM posts WHERE group_id = @groupId').get({ groupId: group.id }) as { c: number }).c;
  const rows = db
    .prepare('SELECT * FROM posts WHERE group_id = @groupId ORDER BY created_at DESC LIMIT @limit OFFSET @offset')
    .all(params) as unknown as PostRow[];
  return { items: rows.map((r) => decoratePost(r, viewerId)), total };
}

export function userPosts(viewerId: string, authorId: string, page: Page): { items: PublicPost[]; total: number } {
  const db = getDb();
  const isSelf = viewerId === authorId;
  const isFriend = areFriends(viewerId, authorId);
  const params = { author: authorId, viewer: viewerId, limit: page.limit, offset: page.offset };
  const visibility = isSelf
    ? '1=1'
    : isFriend
      ? `(group_id IS NULL OR group_id IN (SELECT group_id FROM group_members WHERE user_id = @viewer))`
      : `group_id IS NOT NULL AND group_id IN (SELECT group_id FROM group_members WHERE user_id = @viewer)`;
  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM posts WHERE author_id = @author AND ${visibility}`).get({ author: authorId, viewer: viewerId }) as {
      c: number;
    }
  ).c;
  const rows = db
    .prepare(`SELECT * FROM posts WHERE author_id = @author AND ${visibility} ORDER BY created_at DESC LIMIT @limit OFFSET @offset`)
    .all(params) as unknown as PostRow[];
  return { items: rows.map((r) => decoratePost(r, viewerId)), total };
}

export function editPost(viewerId: string, postId: string, content: string): PublicPost {
  const post = getDb().prepare('SELECT * FROM posts WHERE id = ?').get(postId) as PostRow | undefined;
  if (!post) throw ApiError.notFound('Post not found');
  if (post.author_id !== viewerId) throw ApiError.forbidden('You can only edit your own posts');
  getDb().prepare('UPDATE posts SET content = ?, updated_at = ? WHERE id = ?').run(content, new Date().toISOString(), postId);
  return getPostOrThrow(viewerId, postId);
}

export function deletePost(viewerId: string, postId: string, isSiteAdmin = false): void {
  const post = getDb().prepare('SELECT * FROM posts WHERE id = ?').get(postId) as PostRow | undefined;
  if (!post) throw ApiError.notFound('Post not found');
  const isGroupMod =
    post.group_id &&
    ['owner', 'moderator'].includes(getMemberRow(post.group_id, viewerId)?.role ?? '');
  if (post.author_id !== viewerId && !isSiteAdmin && !isGroupMod) {
    throw ApiError.forbidden('You can only delete your own posts');
  }
  getDb().prepare('DELETE FROM posts WHERE id = ?').run(postId);
}

// ── comments ─────────────────────────────────────────────────────────

export interface PublicComment {
  id: string;
  postId: string;
  author: { id: string; username: string; displayName: string; avatarUrl: string | null };
  content: string;
  reactions: { emoji: string; count: number; reacted: boolean }[];
  createdAt: string;
  edited: boolean;
}

export function createComment(viewerId: string, postId: string, content: string): PublicComment {
  const post = getDb().prepare('SELECT * FROM posts WHERE id = ?').get(postId) as PostRow | undefined;
  if (!post) throw ApiError.notFound('Post not found');
  assertCanViewPost(viewerId, post);
  const id = uuid();
  getDb()
    .prepare('INSERT INTO comments (id, post_id, author_id, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, postId, viewerId, content, new Date().toISOString(), new Date().toISOString());
  if (post.author_id !== viewerId) {
    createNotification({
      userId: post.author_id,
      type: 'comment',
      title: 'New comment on your post',
      body: content.slice(0, 120),
      actorId: viewerId,
      entityType: 'post',
      entityId: postId,
    });
  }
  return decorateComment(
    getDb().prepare('SELECT * FROM comments WHERE id = ?').get(id) as Record<string, unknown>,
    viewerId,
  );
}

function decorateComment(row: Record<string, unknown>, viewerId: string | undefined): PublicComment {
  const reactionRows = getDb()
    .prepare(
      `SELECT emoji, COUNT(*) AS count, SUM(CASE WHEN user_id = ? THEN 1 ELSE 0 END) AS reacted
       FROM reactions WHERE target_type = 'comment' AND target_id = ? GROUP BY emoji ORDER BY count DESC`,
    )
    .all(viewerId ?? '', row.id as string) as { emoji: string; count: number; reacted: number | null }[];
  return {
    id: row.id as string,
    postId: row.post_id as string,
    author: authorOf(row.author_id as string),
    content: row.content as string,
    reactions: reactionRows.map((r) => ({ emoji: r.emoji, count: r.count, reacted: Boolean(r.reacted) })),
    createdAt: row.created_at as string,
    edited: row.updated_at !== row.created_at,
  };
}

export function listComments(viewerId: string, postId: string, page: Page): { items: PublicComment[]; total: number } {
  const post = getDb().prepare('SELECT * FROM posts WHERE id = ?').get(postId) as PostRow | undefined;
  if (!post) throw ApiError.notFound('Post not found');
  assertCanViewPost(viewerId, post);
  const db = getDb();
  const total = (db.prepare('SELECT COUNT(*) AS c FROM comments WHERE post_id = ?').get(postId) as { c: number }).c;
  const rows = db
    .prepare('SELECT * FROM comments WHERE post_id = ? ORDER BY created_at ASC LIMIT ? OFFSET ?')
    .all(postId, page.limit, page.offset) as Record<string, unknown>[];
  return { items: rows.map((r) => decorateComment(r, viewerId)), total };
}

export function editComment(viewerId: string, commentId: string, content: string): PublicComment {
  const row = getDb().prepare('SELECT * FROM comments WHERE id = ?').get(commentId) as Record<string, unknown> | undefined;
  if (!row) throw ApiError.notFound('Comment not found');
  if (row.author_id !== viewerId) throw ApiError.forbidden('You can only edit your own comments');
  getDb().prepare('UPDATE comments SET content = ?, updated_at = ? WHERE id = ?').run(content, new Date().toISOString(), commentId);
  return decorateComment(getDb().prepare('SELECT * FROM comments WHERE id = ?').get(commentId) as Record<string, unknown>, viewerId);
}

export function deleteComment(viewerId: string, commentId: string, isSiteAdmin = false): void {
  const row = getDb().prepare('SELECT * FROM comments WHERE id = ?').get(commentId) as Record<string, unknown> | undefined;
  if (!row) throw ApiError.notFound('Comment not found');
  const post = getDb().prepare('SELECT * FROM posts WHERE id = ?').get(row.post_id as string) as PostRow | undefined;
  const isGroupMod = post?.group_id && ['owner', 'moderator'].includes(getMemberRow(post.group_id, viewerId)?.role ?? '');
  if (row.author_id !== viewerId && !isSiteAdmin && !isGroupMod) {
    throw ApiError.forbidden('You can only delete your own comments');
  }
  getDb().prepare('DELETE FROM comments WHERE id = ?').run(commentId);
}

// ── reactions ────────────────────────────────────────────────────────

const ALLOWED_EMOJI = new Set(['👍', '❤️', '😂', '😮', '😢', '🔥', '🎉', '👀']);

export function react(viewerId: string, targetType: 'post' | 'comment', targetId: string, emoji: string): void {
  if (!ALLOWED_EMOJI.has(emoji)) throw ApiError.badRequest('Unsupported reaction');
  if (targetType === 'post') {
    getPostOrThrow(viewerId, targetId);
  } else {
    const row = getDb().prepare('SELECT * FROM comments WHERE id = ?').get(targetId) as Record<string, unknown> | undefined;
    if (!row) throw ApiError.notFound('Comment not found');
    const post = getDb().prepare('SELECT * FROM posts WHERE id = ?').get(row.post_id as string) as PostRow | undefined;
    if (!post) throw ApiError.notFound('Post not found');
    assertCanViewPost(viewerId, post);
  }
  const db = getDb();
  const existing = db
    .prepare('SELECT id FROM reactions WHERE user_id = ? AND target_type = ? AND target_id = ? AND emoji = ?')
    .get(viewerId, targetType, targetId, emoji);
  if (existing) {
    db.prepare('DELETE FROM reactions WHERE id = ?').run((existing as { id: string }).id);
    return;
  }
  db.prepare('INSERT INTO reactions (id, user_id, target_type, target_id, emoji, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    uuid(),
    viewerId,
    targetType,
    targetId,
    emoji,
    new Date().toISOString(),
  );
  // Notify the content owner.
  let ownerId: string | undefined;
  if (targetType === 'post') {
    ownerId = (db.prepare('SELECT author_id FROM posts WHERE id = ?').get(targetId) as { author_id: string } | undefined)?.author_id;
  } else {
    ownerId = (db.prepare('SELECT author_id FROM comments WHERE id = ?').get(targetId) as { author_id: string } | undefined)?.author_id;
  }
  if (ownerId && ownerId !== viewerId) {
    createNotification({
      userId: ownerId,
      type: 'reaction',
      title: `Someone reacted to your ${targetType}`,
      body: emoji,
      actorId: viewerId,
      entityType: targetType,
      entityId: targetId,
    });
  }
}
