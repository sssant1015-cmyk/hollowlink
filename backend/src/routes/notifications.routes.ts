import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody, validateQuery, asyncHandler } from '../middleware/validate.js';
import { paginationSchema } from '../schemas/common.js';
import { ok } from './respond.js';
import { parsePagination } from '../lib/pagination.js';

const router = Router();
router.use(requireAuth);

router.get(
  '/',
  validateQuery(paginationSchema.extend({ unreadOnly: z.enum(['true', 'false']).optional() })),
  asyncHandler(async (req, res) => {
    const db = getDb();
    const page = parsePagination(req.query);
    const unreadOnly = (req.query as { unreadOnly?: string }).unreadOnly === 'true';
    const params: Record<string, string | number> = { userId: req.user!.id, limit: page.limit, offset: page.offset };
    const where = unreadOnly ? 'user_id = @userId AND read_at IS NULL' : 'user_id = @userId';
    const total = (
      db
        .prepare(`SELECT COUNT(*) AS c FROM notifications WHERE ${where}`)
        .get(unreadOnly ? { userId: req.user!.id } : { userId: req.user!.id }) as { c: number }
    ).c;
    const unread = (
      db.prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read_at IS NULL').get(req.user!.id) as { c: number }
    ).c;
    const rows = db
      .prepare(
        `SELECT n.*, a.username AS actor_username, a.display_name AS actor_display_name, a.avatar_url AS actor_avatar_url
         FROM notifications n LEFT JOIN users a ON a.id = n.actor_id
         WHERE ${where} ORDER BY n.created_at DESC LIMIT @limit OFFSET @offset`,
      )
      .all(params) as Record<string, unknown>[];
    ok(res, {
      items: rows.map((r) => ({
        id: r.id,
        type: r.type,
        title: r.title,
        body: r.body,
        entityType: r.entity_type,
        entityId: r.entity_id,
        actor: r.actor_id ? { id: r.actor_id, username: r.actor_username, displayName: r.actor_display_name, avatarUrl: r.actor_avatar_url } : null,
        read: Boolean(r.read_at),
        createdAt: r.created_at,
      })),
      total,
      unread,
    });
  }),
);

router.post(
  '/:id/read',
  asyncHandler(async (req, res) => {
    getDb()
      .prepare('UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL')
      .run(new Date().toISOString(), req.params.id, req.user!.id);
    const exists = getDb()
      .prepare('SELECT 1 FROM notifications WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user!.id);
    if (!exists) {
      res.status(404).json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Notification not found' } });
      return;
    }
    ok(res, { marked: true });
  }),
);

router.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    getDb()
      .prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL')
      .run(new Date().toISOString(), req.user!.id);
    ok(res, { marked: true });
  }),
);

router.get(
  '/preferences',
  asyncHandler(async (req, res) => {
    const row = getDb().prepare('SELECT notification_prefs FROM users WHERE id = ?').get(req.user!.id) as
      | { notification_prefs: string | null }
      | undefined;
    ok(res, { preferences: JSON.parse(row?.notification_prefs ?? '{}') });
  }),
);

router.put(
  '/preferences',
  validateBody(z.object({ preferences: z.record(z.boolean()) })),
  asyncHandler(async (req, res) => {
    getDb()
      .prepare('UPDATE users SET notification_prefs = ? WHERE id = ?')
      .run(JSON.stringify(req.body.preferences), req.user!.id);
    ok(res, { preferences: req.body.preferences });
  }),
);

export default router;
