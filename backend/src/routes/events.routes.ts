import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { validateBody, validateParams, validateQuery, asyncHandler } from '../middleware/validate.js';
import { paginationSchema } from '../schemas/common.js';
import { ok, created } from './respond.js';
import { parsePagination } from '../lib/pagination.js';
import { createEvent, getEventOrThrow, listEvents, rsvp, deleteEvent } from '../services/events.service.js';

const router = Router();
router.use(requireAuth);

const eventBody = z.object({
  title: z.string().min(2).max(120),
  description: z.string().max(2000).optional(),
  groupId: z.string().max(64).nullable().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD'),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'HH:MM'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  location: z.string().max(200).nullable().optional(),
});

router.post(
  '/',
  validateBody(eventBody),
  asyncHandler(async (req, res) => {
    created(res, createEvent(req.user!.id, req.body));
  }),
);

router.get(
  '/',
  validateQuery(paginationSchema.extend({ scope: z.enum(['upcoming', 'all']).optional() })),
  asyncHandler(async (req, res) => {
    const scope = (req.query as { scope?: 'upcoming' | 'all' }).scope ?? 'upcoming';
    ok(res, listEvents(req.user!.id, scope, parsePagination(req.query)));
  }),
);

router.get(
  '/:id',
  validateParams(z.object({ id: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    ok(res, getEventOrThrow(req.user!.id, req.params.id));
  }),
);

router.post(
  '/:id/rsvp',
  validateParams(z.object({ id: z.string().min(1) })),
  validateBody(z.object({ response: z.enum(['going', 'maybe', 'not_going']) })),
  asyncHandler(async (req, res) => {
    ok(res, rsvp(req.user!.id, req.params.id, req.body.response));
  }),
);

router.delete(
  '/:id',
  validateParams(z.object({ id: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    deleteEvent(req.user!.id, req.params.id);
    ok(res, { deleted: true });
  }),
);

export default router;
