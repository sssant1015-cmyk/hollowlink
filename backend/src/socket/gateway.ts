import type { Server as HttpServer } from 'node:http';
import { Server as IOServer, type Socket } from 'socket.io';
import { config } from '../config/env.js';
import { getDb } from '../db/connection.js';
import { resolveSession } from '../services/auth.service.js';
import * as presence from '../services/presence.js';
import {
  requireConversationMember,
  sendMessage,
  editMessage,
  deleteMessage,
  reactToMessage,
  markRead,
} from '../services/chat.service.js';
import { ApiError } from '../lib/apiError.js';

interface SessionUser {
  id: string;
  username: string;
  displayName: string;
  role: 'user' | 'admin';
  avatarUrl: string | null;
}

// userId -> set of sockets
const onlineSockets = new Map<string, Set<Socket>>();

function emitToUser(io: IOServer, userId: string, event: string, payload: unknown): void {
  io.to(`user:${userId}`).emit(event, payload);
}

export function initGateway(httpServer: HttpServer): IOServer {
  const io = new IOServer(httpServer, {
    cors: {
      origin: config.allowedOrigins,
      credentials: true,
    },
    maxHttpBufferSize: 1e6,
  });

  // Auth middleware — reject sockets without a valid session.
  io.use((socket, next) => {
    const token =
      (socket.handshake.auth?.token as string | undefined) ??
      parseCookieToken(socket.handshake.headers.cookie);
    if (!token) return next(new Error('Authentication required'));
    const user = resolveSession(token);
    if (!user) return next(new Error('Session invalid or expired'));
    socket.data.user = user;
    next();
  });

  io.on('connection', (socket) => {
    const user = socket.data.user as SessionUser;
    const userId = user.id;

    socket.join(`user:${userId}`);
    const set = onlineSockets.get(userId) ?? new Set<Socket>();
    set.add(socket);
    onlineSockets.set(userId, set);
    if (set.size === 1) {
      presence.userConnected(userId, socket.id);
    }

    // Push the online list to everyone.
    io.emit('presence:list', { online: [...onlineSockets.keys()] });
    io.emit('presence:update', { userId, status: 'online' });

    socket.on('presence:away', () => {
      presence.markAway(userId);
      io.emit('presence:update', { userId, status: 'away' });
    });

    socket.on('presence:active', () => {
      presence.touch(userId);
      const entry = presence.getStatus(userId);
      io.emit('presence:update', { userId, status: entry });
    });

    // ── chat ──────────────────────────────────────────────────────
    socket.on('chat:join', ({ conversationId }: { conversationId: string }) => {
      try {
        requireConversationMember(conversationId, userId);
        socket.join(`conversation:${conversationId}`);
      } catch (err) {
        socket.emit('error:api', errorPayload(err));
      }
    });

    socket.on('chat:leave', ({ conversationId }: { conversationId: string }) => {
      socket.leave(`conversation:${conversationId}`);
    });

    socket.on(
      'chat:message',
      ({ conversationId, content, replyToId }: { conversationId: string; content: string; replyToId?: string | null }, ack?: (resp: unknown) => void) => {
        try {
          if (typeof content !== 'string' || content.trim().length === 0 || content.length > 4000) {
            throw ApiError.badRequest('Message must be 1-4000 characters');
          }
          const message = sendMessage(userId, conversationId, content.trim(), replyToId ?? null);
          io.to(`conversation:${conversationId}`).emit('chat:message', message);
          // Notify members who are not currently in the room.
          for (const member of messageMembersExcept(conversationId, userId)) {
            emitToUser(io, member, 'chat:notify', { conversationId, message });
          }
          ack?.({ ok: true, message });
        } catch (err) {
          const payload = errorPayload(err);
          socket.emit('error:api', payload);
          ack?.(payload);
        }
      },
    );

    socket.on('chat:typing', ({ conversationId, typing }: { conversationId: string; typing: boolean }) => {
      try {
        requireConversationMember(conversationId, userId);
        socket.to(`conversation:${conversationId}`).emit('chat:typing', { conversationId, userId, typing });
      } catch {
        // ignore unauthorized typing probes
      }
    });

    socket.on('chat:read', ({ conversationId }: { conversationId: string }) => {
      try {
        markRead(userId, conversationId);
        socket.to(`conversation:${conversationId}`).emit('chat:read', { conversationId, userId, at: new Date().toISOString() });
      } catch (err) {
        socket.emit('error:api', errorPayload(err));
      }
    });

    socket.on(
      'chat:edit',
      ({ messageId, content }: { messageId: string; content: string }, ack?: (resp: unknown) => void) => {
        try {
          if (typeof content !== 'string' || content.trim().length === 0 || content.length > 4000) {
            throw ApiError.badRequest('Message must be 1-4000 characters');
          }
          const message = editMessage(userId, messageId, content.trim());
          io.to(`conversation:${message.conversationId}`).emit('chat:edited', message);
          ack?.({ ok: true, message });
        } catch (err) {
          const payload = errorPayload(err);
          ack?.(payload);
        }
      },
    );

    socket.on('chat:delete', ({ messageId }: { messageId: string }, ack?: (resp: unknown) => void) => {
      try {
        const row = getMessageConversationId(messageId);
        deleteMessage(userId, messageId);
        if (row) io.to(`conversation:${row}`).emit('chat:deleted', { messageId, conversationId: row });
        ack?.({ ok: true });
      } catch (err) {
        const payload = errorPayload(err);
        ack?.(payload);
      }
    });

    socket.on(
      'chat:react',
      ({ messageId, emoji }: { messageId: string; emoji: string }, ack?: (resp: unknown) => void) => {
        try {
          if (typeof emoji !== 'string' || emoji.length === 0 || emoji.length > 16) {
            throw ApiError.badRequest('Invalid emoji');
          }
          reactToMessage(userId, messageId, emoji);
          const conversationId = getMessageConversationId(messageId);
          if (conversationId) {
            io.to(`conversation:${conversationId}`).emit('chat:reacted', { messageId, conversationId, emoji, userId });
          }
          ack?.({ ok: true });
        } catch (err) {
          const payload = errorPayload(err);
          ack?.(payload);
        }
      },
    );

    socket.on('disconnect', () => {
      const set = onlineSockets.get(userId);
      if (set) {
        set.delete(socket);
        if (set.size === 0) {
          onlineSockets.delete(userId);
          presence.userDisconnected(userId, socket.id);
          io.emit('presence:update', { userId, status: 'offline' });
        }
      }
    });
  });

  // Periodic away sweep.
  const sweep = setInterval(() => {
    for (const userId of presence.onlineUserIds()) {
      const before = presence.getStatus(userId);
      presence.sweepAway();
      const after = presence.getStatus(userId);
      if (before !== after) io.emit('presence:update', { userId, status: after });
    }
  }, 60_000);
  sweep.unref();

  return io;
}

function messageMembersExcept(conversationId: string, exceptUserId: string): string[] {
  const rows = getDb()
    .prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ?')
    .all(conversationId) as { user_id: string }[];
  return rows.map((r) => r.user_id).filter((id) => id !== exceptUserId);
}

function getMessageConversationId(messageId: string): string | null {
  const row = getDb().prepare('SELECT conversation_id FROM messages WHERE id = ?').get(messageId) as
    | { conversation_id: string }
    | undefined;
  return row?.conversation_id ?? null;
}

function errorPayload(err: unknown): { code: string; message: string } {
  if (err instanceof ApiError) return { code: err.code, message: err.message };
  return { code: 'INTERNAL_ERROR', message: 'Something went wrong' };
}

function parseCookieToken(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === config.cookieName) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export { emitToUser };
