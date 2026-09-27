import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { validateBody, validateParams, validateQuery, asyncHandler } from '../middleware/validate.js';
import { paginationSchema } from '../schemas/common.js';
import { ok, created } from './respond.js';
import { parsePagination } from '../lib/pagination.js';
import {
  openDm,
  getGroupChat,
  getConversation,
  listConversations,
  listMessages,
  editMessage,
  deleteMessage,
  markRead,
} from '../services/chat.service.js';

const router = Router();
router.use(requireAuth);

router.get(
  '/',
  validateQuery(paginationSchema),
  asyncHandler(async (req, res) => {
    ok(res, listConversations(req.user!.id, parsePagination(req.query)));
  }),
);

router.post(
  '/dm',
  validateBody(z.object({ userId: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    created(res, openDm(req.user!.id, req.body.userId));
  }),
);

router.get(
  '/group/:groupId',
  validateParams(z.object({ groupId: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    ok(res, getGroupChat(req.user!.id, req.params.groupId));
  }),
);

router.get(
  '/:id',
  validateParams(z.object({ id: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    ok(res, getConversation(req.user!.id, req.params.id));
  }),
);

router.get(
  '/:id/messages',
  validateParams(z.object({ id: z.string().min(1) })),
  validateQuery(paginationSchema),
  asyncHandler(async (req, res) => {
    ok(res, listMessages(req.user!.id, req.params.id, parsePagination(req.query)));
  }),
);

router.post(
  '/:id/read',
  validateParams(z.object({ id: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    markRead(req.user!.id, req.params.id);
    ok(res, { read: true });
  }),
);

router.patch(
  '/messages/:messageId',
  validateParams(z.object({ messageId: z.string().min(1) })),
  validateBody(z.object({ content: z.string().min(1).max(4000) })),
  asyncHandler(async (req, res) => {
    ok(res, editMessage(req.user!.id, req.params.messageId, req.body.content));
  }),
);

router.delete(
  '/messages/:messageId',
  validateParams(z.object({ messageId: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    deleteMessage(req.user!.id, req.params.messageId);
    ok(res, { deleted: true });
  }),
);

export default router;
