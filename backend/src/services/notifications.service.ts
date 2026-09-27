import { uuid, transaction } from '../lib/crypto.js';
import { getDb } from '../db/connection.js';

export type NotificationType =
  | 'friend_request'
  | 'friend_accepted'
  | 'group_invite'
  | 'announcement'
  | 'reaction'
  | 'comment'
  | 'message'
  | 'event'
  | 'system';

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  actorId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
}

/** Preference keys default to true (enabled) when unset. */
const TYPE_TO_PREF: Record<NotificationType, string> = {
  friend_request: 'friendRequests',
  friend_accepted: 'friendRequests',
  group_invite: 'groups',
  announcement: 'announcements',
  reaction: 'reactions',
  comment: 'comments',
  message: 'messages',
  event: 'events',
  system: 'system',
};

function userAllows(userId: string, type: NotificationType): boolean {
  try {
    const row = getDb().prepare('SELECT notification_prefs FROM users WHERE id = ?').get(userId) as
      | { notification_prefs: string | null }
      | undefined;
    if (!row?.notification_prefs) return true;
    const prefs = JSON.parse(row.notification_prefs) as Record<string, boolean>;
    const key = TYPE_TO_PREF[type];
    return prefs[key] !== false;
  } catch {
    return true; // unreadable prefs never block notifications
  }
}

export function createNotification(input: CreateNotificationInput): void {
  if (!userAllows(input.userId, input.type)) return;
  const db = getDb();
  db.prepare(
    `INSERT INTO notifications (id, user_id, type, actor_id, entity_type, entity_id, title, body, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    uuid(),
    input.userId,
    input.type,
    input.actorId ?? null,
    input.entityType ?? null,
    input.entityId ?? null,
    input.title,
    input.body ?? '',
    new Date().toISOString(),
  );
}

export function createNotifications(inputs: CreateNotificationInput[]): void {
  if (inputs.length === 0) return;
  transaction(() => {
    for (const item of inputs) createNotification(item);
  });
}
