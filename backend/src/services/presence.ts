import { getDb } from '../db/connection.js';

export type PresenceStatus = 'online' | 'away' | 'offline';

export interface PresenceEntry {
  userId: string;
  status: PresenceStatus;
  lastSeen: number;
}

/**
 * In-memory presence registry. HollowLink presence reflects app activity only.
 * Away = connected but no activity for AWAY_MS; offline = no open socket.
 */
const AWAY_MS = 5 * 60 * 1000;

const connected = new Map<string, PresenceEntry>();
const socketsByUser = new Map<string, Set<string>>();
let listeners: ((userId: string, status: PresenceStatus) => void)[] = [];

export function onPresenceChange(fn: (userId: string, status: PresenceStatus) => void): void {
  listeners.push(fn);
}

export function userConnected(userId: string, socketId: string): void {
  const set = socketsByUser.get(userId) ?? new Set<string>();
  set.add(socketId);
  socketsByUser.set(userId, set);
  if (!connected.has(userId)) {
    connected.set(userId, { userId, status: 'online', lastSeen: Date.now() });
    persist(userId, 'online');
    for (const fn of listeners) fn(userId, 'online');
  }
}

export function userDisconnected(userId: string, socketId: string): void {
  const set = socketsByUser.get(userId);
  if (!set) return;
  set.delete(socketId);
  if (set.size > 0) return; // other tabs still connected
  socketsByUser.delete(userId);
  connected.delete(userId);
  persist(userId, 'offline');
  for (const fn of listeners) fn(userId, 'offline');
}

export function touch(userId: string): void {
  const entry = connected.get(userId);
  if (!entry) return;
  if (Date.now() - entry.lastSeen > AWAY_MS) {
    entry.status = 'online';
    persist(userId, 'online');
  }
  entry.lastSeen = Date.now();
}

export function markAway(userId: string): void {
  const entry = connected.get(userId);
  if (!entry) return;
  entry.status = 'away';
  persist(userId, 'away');
  for (const fn of listeners) fn(userId, 'away');
}

export function sweepAway(): void {
  const now = Date.now();
  for (const entry of connected.values()) {
    if (entry.status === 'online' && now - entry.lastSeen > AWAY_MS) {
      entry.status = 'away';
      persist(entry.userId, 'away');
      for (const fn of listeners) fn(entry.userId, 'away');
    }
  }
}

export function getStatus(userId: string): PresenceStatus {
  return connected.get(userId)?.status ?? 'offline';
}

export function isOnline(userId: string): boolean {
  return connected.has(userId);
}

export function onlineUserIds(): string[] {
  return [...connected.keys()];
}

function persist(userId: string, status: PresenceStatus): void {
  try {
    getDb()
      .prepare('UPDATE users SET status = ?, updated_at = updated_at WHERE id = ?')
      .run(status, userId);
  } catch {
    // DB may not be migrated yet in some test bootstraps; presence is ephemeral anyway.
  }
}
