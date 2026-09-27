import { getDb } from '../db/connection.js';
import { uuid, randomToken, transaction } from '../lib/crypto.js';
import { ApiError } from '../lib/apiError.js';
import { likeEscape } from '../lib/pagination.js';
import { createNotifications } from './notifications.service.js';
import { areFriends } from './users.service.js';
import type { Page } from '../lib/pagination.js';

export type GroupRole = 'owner' | 'moderator' | 'member';

export interface GroupRow {
  id: string;
  name: string;
  description: string;
  icon_url: string | null;
  banner_url: string | null;
  is_private: number;
  invite_code: string;
  owner_id: string;
  created_at: string;
}

export interface GroupMemberRow {
  group_id: string;
  user_id: string;
  role: GroupRole;
  joined_at: string;
}

// ── lookups ──────────────────────────────────────────────────────────

export function getGroupRow(groupId: string): GroupRow | undefined {
  return getDb().prepare('SELECT * FROM groups WHERE id = ?').get(groupId) as GroupRow | undefined;
}

export function getGroupOrThrow(groupId: string): GroupRow {
  const row = getGroupRow(groupId);
  if (!row) throw ApiError.notFound('Group not found');
  return row;
}

export function getMemberRow(groupId: string, userId: string): GroupMemberRow | undefined {
  return getDb()
    .prepare('SELECT * FROM group_members WHERE group_id = ? AND user_id = ?')
    .get(groupId, userId) as GroupMemberRow | undefined;
}

export function requireMember(groupId: string, userId: string): GroupMemberRow {
  const member = getMemberRow(groupId, userId);
  if (!member) throw ApiError.forbidden('You are not a member of this group');
  return member;
}

export function requireRole(groupId: string, userId: string, ...roles: GroupRole[]): GroupMemberRow {
  const member = requireMember(groupId, userId);
  if (!roles.includes(member.role)) {
    throw ApiError.forbidden('You do not have the required role for this action');
  }
  return member;
}

// ── CRUD ─────────────────────────────────────────────────────────────

export function createGroup(ownerId: string, data: { name: string; description?: string; isPrivate: boolean }): GroupRow {
  const db = getDb();
  const now = new Date().toISOString();
  const group: GroupRow & Record<string, string | number | null> = {
    id: uuid(),
    name: data.name,
    description: data.description ?? '',
    icon_url: null,
    banner_url: null,
    is_private: data.isPrivate ? 1 : 0,
    invite_code: randomToken(8),
    owner_id: ownerId,
    created_at: now,
  };
  transaction(() => {
    db.prepare(
      `INSERT INTO groups (id, name, description, icon_url, banner_url, is_private, invite_code, owner_id, created_at, updated_at)
       VALUES (@id, @name, @description, @icon_url, @banner_url, @is_private, @invite_code, @owner_id, @created_at, @created_at)`,
    ).run(group as unknown as Record<string, string | number | null>);
    db.prepare(
      `INSERT INTO group_members (id, group_id, user_id, role, joined_at) VALUES (?, ?, ?, 'owner', ?)`,
    ).run(uuid(), group.id, ownerId, now);
  });
  return group;
}

export function updateGroup(groupId: string, data: { name?: string; description?: string; isPrivate?: boolean }): void {
  getGroupOrThrow(groupId); // 404 when missing
  const sets: string[] = [];
  const params: Record<string, unknown> = { id: groupId, updated_at: new Date().toISOString() };
  if (data.name !== undefined) {
    sets.push('name = @name');
    params.name = data.name;
  }
  if (data.description !== undefined) {
    sets.push('description = @description');
    params.description = data.description;
  }
  if (data.isPrivate !== undefined) {
    sets.push('is_private = @is_private');
    params.is_private = data.isPrivate ? 1 : 0;
  }
  if (sets.length === 0) return;
  sets.push('updated_at = @updated_at');
  getDb()
    .prepare(`UPDATE groups SET ${sets.join(', ')} WHERE id = @id`)
    .run(params as Record<string, string | number>);
}

export function deleteGroup(groupId: string): void {
  getDb().prepare('DELETE FROM groups WHERE id = ?').run(groupId);
}

export interface PublicGroup {
  id: string;
  name: string;
  description: string;
  iconUrl: string | null;
  bannerUrl: string | null;
  isPrivate: boolean;
  ownerId: string;
  memberCount: number;
  createdAt: string;
  viewerRole?: GroupRole | null;
}

export function toPublicGroup(row: GroupRow, viewerId?: string): PublicGroup {
  const memberCount = (
    getDb().prepare('SELECT COUNT(*) AS c FROM group_members WHERE group_id = ?').get(row.id) as { c: number }
  ).c;
  const viewerMember = viewerId ? getMemberRow(row.id, viewerId) : undefined;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    iconUrl: row.icon_url,
    bannerUrl: row.banner_url,
    isPrivate: Boolean(row.is_private),
    ownerId: row.owner_id,
    memberCount,
    createdAt: row.created_at,
    viewerRole: viewerMember?.role ?? null,
  };
}

export function listUserGroups(userId: string, page: Page): { items: PublicGroup[]; total: number } {
  const db = getDb();
  const total = (
    db.prepare('SELECT COUNT(*) AS c FROM group_members WHERE user_id = ?').get(userId) as { c: number }
  ).c;
  const rows = db
    .prepare(
      `SELECT g.* FROM group_members m JOIN groups g ON g.id = m.group_id
       WHERE m.user_id = ? ORDER BY g.name COLLATE NOCASE LIMIT ? OFFSET ?`,
    )
    .all(userId, page.limit, page.offset) as unknown as GroupRow[];
  return { items: rows.map((row) => toPublicGroup(row, userId)), total };
}

export function discoverGroups(viewerId: string, query: string | undefined, page: Page): { items: PublicGroup[]; total: number } {
  const db = getDb();
  const pattern = query ? `%${likeEscape(query)}%` : null;
  const where = pattern
    ? `g.is_private = 0 AND (g.name LIKE @pattern ESCAPE '\\' OR g.description LIKE @pattern ESCAPE '\\')`
    : `g.is_private = 0`;
  const params: Record<string, string | number> = { limit: page.limit, offset: page.offset };
  if (pattern) params.pattern = pattern;
  const countParams: Record<string, string | number> = pattern ? { pattern } : {};
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM groups g WHERE ${where}`).get(countParams) as { c: number }).c;
  const rows = db
    .prepare(`SELECT g.* FROM groups g WHERE ${where} ORDER BY g.name COLLATE NOCASE LIMIT @limit OFFSET @offset`)
    .all(params) as unknown as GroupRow[];
  return { items: rows.map((row) => toPublicGroup(row, viewerId)), total };
}

// ── membership ───────────────────────────────────────────────────────

export function joinGroup(userId: string, groupId: string): void {
  const group = getGroupOrThrow(groupId);
  if (group.is_private) throw ApiError.forbidden('This group is private — an invite is required');
  addMember(groupId, userId, 'member');
}

export function addMember(groupId: string, userId: string, role: GroupRole = 'member'): void {
  const db = getDb();
  db.prepare(
    `INSERT OR IGNORE INTO group_members (id, group_id, user_id, role, joined_at) VALUES (?, ?, ?, ?, ?)`,
  ).run(uuid(), groupId, userId, role, new Date().toISOString());
}

export function leaveGroup(groupId: string, userId: string): void {
  const group = getGroupOrThrow(groupId);
  if (group.owner_id === userId) {
    throw ApiError.badRequest('Owners cannot leave their group — transfer ownership or delete the group');
  }
  const result = getDb().prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(groupId, userId);
  if (result.changes === 0) throw ApiError.notFound('You are not a member of this group');
}

export function removeMember(actorId: string, groupId: string, targetId: string): void {
  const group = getGroupOrThrow(groupId);
  if (targetId === actorId) throw ApiError.badRequest('Use leave instead');
  if (targetId === group.owner_id) throw ApiError.forbidden('The owner cannot be removed');
  const actor = requireRole(groupId, actorId, 'owner', 'moderator');
  const target = getMemberRow(groupId, targetId);
  if (!target) throw ApiError.notFound('Member not found');
  // Moderators cannot remove other moderators or the owner. Owner can remove anyone.
  if (actor.role === 'moderator' && target.role !== 'member') {
    throw ApiError.forbidden('Moderators can only remove regular members');
  }
  getDb().prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(groupId, targetId);
}

export function setMemberRole(actorId: string, groupId: string, targetId: string, role: Exclude<GroupRole, 'owner'> | 'owner'): void {
  const group = getGroupOrThrow(groupId);
  if (group.owner_id !== actorId) throw ApiError.forbidden('Only the owner can change roles');
  if (targetId === group.owner_id && role !== 'owner') {
    throw ApiError.badRequest('Transfer ownership before demoting the owner');
  }
  const target = getMemberRow(groupId, targetId);
  if (!target) throw ApiError.notFound('Member not found');
  const db = getDb();
  transaction(() => {
    if (role === 'owner') {
      // Ownership transfer: demote old owner to moderator.
      db.prepare('UPDATE group_members SET role = ? WHERE group_id = ? AND user_id = ?').run('moderator', groupId, actorId);
      db.prepare('UPDATE groups SET owner_id = ?, updated_at = ? WHERE id = ?').run(targetId, new Date().toISOString(), groupId);
      db.prepare('UPDATE group_members SET role = ? WHERE group_id = ? AND user_id = ?').run('owner', groupId, targetId);
    } else {
      db.prepare('UPDATE group_members SET role = ? WHERE group_id = ? AND user_id = ?').run(role, groupId, targetId);
    }
  });
}

export function listMembers(
  groupId: string,
  page: Page,
): { items: (GroupMemberRow & { user: { id: string; username: string; displayName: string; avatarUrl: string | null } })[]; total: number } {
  const db = getDb();
  const total = (
    db.prepare('SELECT COUNT(*) AS c FROM group_members WHERE group_id = ?').get(groupId) as { c: number }
  ).c;
  const rows = db
    .prepare(
      `SELECT m.role, m.joined_at, u.id, u.username, u.display_name, u.avatar_url
       FROM group_members m JOIN users u ON u.id = m.user_id
       WHERE m.group_id = ? ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'moderator' THEN 1 ELSE 2 END, u.display_name COLLATE NOCASE
       LIMIT ? OFFSET ?`,
    )
    .all(groupId, page.limit, page.offset) as { role: GroupRole; joined_at: string; id: string; username: string; display_name: string; avatar_url: string | null }[];
  return {
    items: rows.map((r) => ({
      group_id: groupId,
      user_id: r.id,
      role: r.role,
      joined_at: r.joined_at,
      user: { id: r.id, username: r.username, displayName: r.display_name, avatarUrl: r.avatar_url },
    })) as unknown as (GroupMemberRow & {
      user: { id: string; username: string; displayName: string; avatarUrl: string | null };
    })[],
    total,
  } as { items: (GroupMemberRow & { user: { id: string; username: string; displayName: string; avatarUrl: string | null } })[]; total: number };
}

// ── invites ──────────────────────────────────────────────────────────

export function inviteFriendToGroup(actorId: string, groupId: string, friendId: string): { code: string } {
  const group = getGroupOrThrow(groupId);
  requireRole(groupId, actorId, 'owner', 'moderator', 'member');
  if (!areFriends(actorId, friendId)) throw ApiError.forbidden('You can only invite friends');
  if (getMemberRow(groupId, friendId)) throw ApiError.conflict('User is already a member');
  if (group.is_private) {
    // Reuse the group's invite code for private groups.
    return { code: group.invite_code };
  }
  return { code: group.invite_code };
}

export function joinByInviteCode(userId: string, code: string): PublicGroup {
  const db = getDb();
  const group = db.prepare('SELECT * FROM groups WHERE invite_code = ?').get(code) as GroupRow | undefined;
  if (!group) throw ApiError.notFound('Invalid invite code');
  if (!getMemberRow(group.id, userId)) {
    addMember(group.id, userId, 'member');
  }
  return toPublicGroup(group, userId);
}

export function rotateInviteCode(actorId: string, groupId: string): { code: string } {
  requireRole(groupId, actorId, 'owner');
  const code = randomToken(8);
  getDb().prepare('UPDATE groups SET invite_code = ?, updated_at = ? WHERE id = ?').run(code, new Date().toISOString(), groupId);
  return { code };
}

// ── announcements ────────────────────────────────────────────────────

export function createAnnouncement(actorId: string, groupId: string, data: { title: string; body: string; imageUrl?: string | null }): { id: string } {
  requireRole(groupId, actorId, 'owner', 'moderator');
  const id = uuid();
  getDb()
    .prepare(
      `INSERT INTO announcements (id, group_id, author_id, title, body, image_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, groupId, actorId, data.title, data.body, data.imageUrl ?? null, new Date().toISOString());

  const memberRows = getDb()
    .prepare('SELECT user_id FROM group_members WHERE group_id = ? AND user_id != ?')
    .all(groupId, actorId) as { user_id: string }[];
  const groupName = getGroupOrThrow(groupId).name;
  createNotifications(
    memberRows.map((m) => ({
      userId: m.user_id,
      type: 'announcement' as const,
      title: `Announcement in ${groupName}`,
      body: data.title,
      actorId,
      entityType: 'group',
      entityId: groupId,
    })),
  );
  return { id };
}

export function listAnnouncements(groupId: string, page: Page): {
  items: { id: string; title: string; body: string; imageUrl: string | null; pinned: boolean; author: { id: string; username: string; displayName: string }; createdAt: string }[];
  total: number;
} {
  const db = getDb();
  const total = (db.prepare('SELECT COUNT(*) AS c FROM announcements WHERE group_id = ?').get(groupId) as { c: number }).c;
  const rows = db
    .prepare(
      `SELECT a.*, u.username, u.display_name FROM announcements a JOIN users u ON u.id = a.author_id
       WHERE a.group_id = ? ORDER BY a.pinned DESC, a.created_at DESC LIMIT ? OFFSET ?`,
    )
    .all(groupId, page.limit, page.offset) as Record<string, unknown>[];
  return {
    items: rows.map((r) => ({
      id: r.id as string,
      title: r.title as string,
      body: r.body as string,
      imageUrl: (r.image_url as string | null) ?? null,
      pinned: Boolean(r.pinned),
      author: { id: r.author_id as string, username: r.username as string, displayName: r.display_name as string },
      createdAt: r.created_at as string,
    })),
    total,
  };
}

export function deleteAnnouncement(actorId: string, groupId: string, announcementId: string): void {
  requireRole(groupId, actorId, 'owner', 'moderator');
  const result = getDb().prepare('DELETE FROM announcements WHERE id = ? AND group_id = ?').run(announcementId, groupId);
  if (result.changes === 0) throw ApiError.notFound('Announcement not found');
}
