import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/connection.js';
import { uuid } from '../lib/crypto.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody, validateQuery, asyncHandler } from '../middleware/validate.js';
import { paginationSchema } from '../schemas/common.js';
import { ok, created } from './respond.js';
import { parsePagination } from '../lib/pagination.js';
import { ApiError } from '../lib/apiError.js';

const router = Router();
router.use(requireAuth);

const reportSchema = z.object({
  targetType: z.enum(['post', 'comment', 'user', 'group', 'message']),
  targetId: z.string().min(1).max(64),
  reason: z.enum(['spam', 'harassment', 'inappropriate', 'misinformation', 'other']),
  description: z.string().max(1000).optional(),
});

router.post(
  '/',
  validateBody(reportSchema),
  asyncHandler(async (req, res) => {
    const db = getDb();
    const { targetType, targetId, reason, description } = req.body;
    // Verify the target exists (existence only — reporting does not grant read access to content).
    let exists = false;
    if (targetType === 'post') exists = Boolean(db.prepare('SELECT 1 FROM posts WHERE id = ?').get(targetId));
    else if (targetType === 'comment') exists = Boolean(db.prepare('SELECT 1 FROM comments WHERE id = ?').get(targetId));
    else if (targetType === 'user') exists = Boolean(db.prepare('SELECT 1 FROM users WHERE id = ?').get(targetId));
    else if (targetType === 'group') exists = Boolean(db.prepare('SELECT 1 FROM groups WHERE id = ?').get(targetId));
    else if (targetType === 'message') exists = Boolean(db.prepare('SELECT 1 FROM messages WHERE id = ?').get(targetId));
    if (!exists) throw ApiError.notFound('Report target not found');

    const id = uuid();
    db.prepare(
      `INSERT INTO reports (id, reporter_id, target_type, target_id, reason, description, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
    ).run(id, req.user!.id, targetType, targetId, reason, description ?? '', new Date().toISOString());
    created(res, { id, status: 'pending' });
  }),
);

router.get(
  '/mine',
  validateQuery(paginationSchema),
  asyncHandler(async (req, res) => {
    const db = getDb();
    const page = parsePagination(req.query);
    const params = { reporter: req.user!.id, limit: page.limit, offset: page.offset };
    const total = (db.prepare('SELECT COUNT(*) AS c FROM reports WHERE reporter_id = @reporter').get({ reporter: req.user!.id }) as { c: number }).c;
    const rows = db
      .prepare('SELECT * FROM reports WHERE reporter_id = @reporter ORDER BY created_at DESC LIMIT @limit OFFSET @offset')
      .all(params) as Record<string, unknown>[];
    ok(res, { items: rows.map(decorateReport), total });
  }),
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (req.user!.role !== 'admin') throw ApiError.forbidden('Admin access required');
    const db = getDb();
    const page = parsePagination(req.query);
    const status = (req.query as { status?: string }).status;
    const params: Record<string, string | number> = { limit: page.limit, offset: page.offset };
    const where = status ? 'status = @status' : '1=1';
    if (status) params.status = status;
    const total = (db.prepare(`SELECT COUNT(*) AS c FROM reports WHERE ${where}`).get(status ? { status } : {}) as { c: number }).c;
    const rows = db
      .prepare(`SELECT * FROM reports WHERE ${where} ORDER BY created_at DESC LIMIT @limit OFFSET @offset`)
      .all(params) as Record<string, unknown>[];
    ok(res, { items: rows.map(decorateReport), total });
  }),
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    if (req.user!.role !== 'admin') throw ApiError.forbidden('Admin access required');
    const parsed = z
      .object({ status: z.enum(['pending', 'reviewing', 'resolved', 'dismissed']) })
      .parse(req.body);
    const result = getDb()
      .prepare('UPDATE reports SET status = ?, resolved_by = ?, resolved_at = ? WHERE id = ?')
      .run(parsed.status, req.user!.id, new Date().toISOString(), req.params.id);
    if (result.changes === 0) throw ApiError.notFound('Report not found');
    ok(res, { updated: true });
  }),
);

function decorateReport(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    targetType: row.target_type,
    targetId: row.target_id,
    reason: row.reason,
    description: row.description,
    status: row.status,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
}

export default router;
