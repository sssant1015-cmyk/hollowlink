import { getDb } from '../db/connection.js';
import { uuid } from '../lib/crypto.js';
import { ApiError } from '../lib/apiError.js';
import { getGroupOrThrow, getMemberRow, requireMember } from './groups.service.js';
import { createNotifications, createNotification } from './notifications.service.js';
import { getUserRowById, areFriends } from './users.service.js';
import type { Page } from '../lib/pagination.js';

export type Rsvp = 'going' | 'maybe' | 'not_going';

export interface PublicEvent {
  id: string;
  title: string;
  description: string;
  groupId: string | null;
  creator: { id: string; username: string; displayName: string };
  date: string;
  startTime: string;
  endTime: string | null;
  location: string | null;
  attendees: { going: number; maybe: number; notGoing: number; viewerResponse: Rsvp | null };
  createdAt: string;
}

function displayNameOf(userId: string): { id: string; username: string; displayName: string } {
  const row = getUserRowById(userId);
  if (!row) return { id: userId, username: 'unknown', displayName: 'Unknown' };
  return { id: userId, username: row.username as string, displayName: row.display_name as string };
}

export function createEvent(
  creatorId: string,
  data: { title: string; description?: string; groupId?: string | null; date: string; startTime: string; endTime?: string | null; location?: string | null },
): PublicEvent {
  if (data.groupId) {
    requireMember(data.groupId, creatorId);
  }
  const db = getDb();
  const id = uuid();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO events (id, title, description, group_id, creator_id, date, start_time, end_time, location, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    data.title,
    data.description ?? '',
    data.groupId ?? null,
    creatorId,
    data.date,
    data.startTime,
    data.endTime ?? null,
    data.location ?? null,
    now,
    now,
  );
  // Auto-RSVP the creator as going.
  rsvp(creatorId, id, 'going');

  if (data.groupId) {
    const members = db.prepare('SELECT user_id FROM group_members WHERE group_id = ? AND user_id != ?').all(data.groupId, creatorId) as { user_id: string }[];
    const groupName = getGroupOrThrow(data.groupId).name;
    createNotifications(
      members.map((m) => ({
        userId: m.user_id,
        type: 'event' as const,
        title: `New event in ${groupName}`,
        body: data.title,
        actorId: creatorId,
        entityType: 'event',
        entityId: id,
      })),
    );
  }
  return getEventOrThrow(creatorId, id);
}

export function getEventOrThrow(viewerId: string | undefined, eventId: string): PublicEvent {
  const row = getDb().prepare('SELECT * FROM events WHERE id = ?').get(eventId) as Record<string, unknown> | undefined;
  if (!row) throw ApiError.notFound('Event not found');
  if (row.group_id) {
    if (!viewerId || !getMemberRow(row.group_id as string, viewerId)) {
      throw ApiError.forbidden('You do not have access to this event');
    }
  } else {
    // Standalone event: visible to the creator, attendees, and friends of the creator.
    if (!viewerId) throw ApiError.unauthorized();
    if (row.creator_id !== viewerId) {
      const attendee = getDb()
        .prepare('SELECT 1 FROM event_attendees WHERE event_id = ? AND user_id = ?')
        .get(eventId, viewerId);
      if (!attendee && !areFriends(viewerId, row.creator_id as string)) {
        throw ApiError.forbidden('You do not have access to this event');
      }
    }
  }
  return decorateEvent(row, viewerId);
}

function decorateEvent(row: Record<string, unknown>, viewerId: string | undefined): PublicEvent {
  const db = getDb();
  const eventId = row.id as string;
  const counts = db
    .prepare(
      `SELECT
        SUM(CASE WHEN response = 'going' THEN 1 ELSE 0 END) AS going,
        SUM(CASE WHEN response = 'maybe' THEN 1 ELSE 0 END) AS maybe,
        SUM(CASE WHEN response = 'not_going' THEN 1 ELSE 0 END) AS notGoing
       FROM event_attendees WHERE event_id = ?`,
    )
    .get(eventId) as { going: number | null; maybe: number | null; notGoing: number | null };
  const viewerResponse = viewerId
    ? ((db.prepare('SELECT response FROM event_attendees WHERE event_id = ? AND user_id = ?').get(eventId, viewerId) as { response: Rsvp } | undefined)?.response ?? null)
    : null;
  return {
    id: row.id as string,
    title: row.title as string,
    description: row.description as string,
    groupId: (row.group_id as string | null) ?? null,
    creator: displayNameOf(row.creator_id as string),
    date: row.date as string,
    startTime: row.start_time as string,
    endTime: (row.end_time as string | null) ?? null,
    location: (row.location as string | null) ?? null,
    attendees: {
      going: counts.going ?? 0,
      maybe: counts.maybe ?? 0,
      notGoing: counts.notGoing ?? 0,
      viewerResponse,
    },
    createdAt: row.created_at as string,
  };
}

/** Events visible to the viewer: their own, group events of their groups, others' standalone events they were invited to via attendees. */
export function listEvents(viewerId: string, scope: 'upcoming' | 'all', page: Page): { items: PublicEvent[]; total: number } {
  const db = getDb();
  const timeFilter = scope === 'upcoming' ? `AND e.date >= date('now')` : '';
  const where = `
    (e.creator_id = @viewer)
    OR (e.group_id IN (SELECT group_id FROM group_members WHERE user_id = @viewer))
    OR (e.id IN (SELECT event_id FROM event_attendees WHERE user_id = @viewer))
    OR (e.group_id IS NULL AND e.creator_id IN (SELECT friend_id FROM friendships WHERE user_id = @viewer))
  `;
  const params2: Record<string, string | number> = { viewer: viewerId, limit: page.limit, offset: page.offset };
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM events e WHERE ${where} ${timeFilter}`).get({ viewer: viewerId }) as { c: number }).c;
  const rows = db
    .prepare(`SELECT e.* FROM events e WHERE ${where} ${timeFilter} ORDER BY e.date ASC, e.start_time ASC LIMIT @limit OFFSET @offset`)
    .all(params2) as Record<string, unknown>[];
  return { items: rows.map((r) => decorateEvent(r, viewerId)), total };
}

export function rsvp(userId: string, eventId: string, response: Rsvp): PublicEvent {
  const getEventOrThrowLocal = getEventOrThrow;
  const event = getEventOrThrowLocal(userId, eventId);
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO event_attendees (id, event_id, user_id, response, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(event_id, user_id) DO UPDATE SET response = excluded.response, updated_at = excluded.updated_at`,
  ).run(uuid(), eventId, userId, response, now);

  // Notify the creator about RSVP changes (not for their own RSVP).
  const row = db.prepare('SELECT creator_id, title FROM events WHERE id = ?').get(eventId) as { creator_id: string; title: string };
  if (row.creator_id !== userId) {
    createNotification({
      userId: row.creator_id,
      type: 'event',
      title: 'Event RSVP update',
      body: `Response for "${row.title}": ${response.replace('_', ' ')}`,
      actorId: userId,
      entityType: 'event',
      entityId: eventId,
    });
  }
  return event;
}

export function deleteEvent(userId: string, eventId: string): void {
  const row = getDb().prepare('SELECT * FROM events WHERE id = ?').get(eventId) as Record<string, unknown> | undefined;
  if (!row) throw ApiError.notFound('Event not found');
  const isGroupOwnerOrMod =
    row.group_id && ['owner', 'moderator'].includes(getMemberRow(row.group_id as string, userId)?.role ?? '');
  if (row.creator_id !== userId && !isGroupOwnerOrMod) {
    throw ApiError.forbidden('You can only delete your own events');
  }
  getDb().prepare('DELETE FROM events WHERE id = ?').run(eventId);
}

// Re-export for route use
export { getMemberRow };
