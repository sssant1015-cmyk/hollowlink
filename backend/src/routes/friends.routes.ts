import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { validateBody, validateParams, validateQuery, asyncHandler } from '../middleware/validate.js';
import { searchSchema, idParam, paginationSchema } from '../schemas/common.js';
import { ok, created } from './respond.js';
import { parsePagination } from '../lib/pagination.js';
import { getPublicUserById, getUserRowByUsername } from '../services/users.service.js';
import {
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  cancelFriendRequest,
  removeFriend,
  listFriends,
  listIncomingRequests,
  listOutgoingRequests,
  blockUser,
  unblockUser,
  listBlocks,
  searchUsers,
} from '../services/friends.service.js';
import { ApiError } from '../lib/apiError.js';

const router = Router();
router.use(requireAuth);

router.get(
  '/',
  validateQuery(paginationSchema),
  asyncHandler(async (req, res) => {
    const page = parsePagination(req.query);
    ok(res, listFriends(req.user!.id, page));
  }),
);

router.get(
  '/requests',
  asyncHandler(async (req, res) => {
    ok(res, { incoming: listIncomingRequests(req.user!.id), outgoing: listOutgoingRequests(req.user!.id) });
  }),
);

router.post(
  '/requests',
  validateBody(z.object({ username: z.string().min(1).max(32).optional(), userId: z.string().min(1).optional(), message: z.string().max(280).optional() })),
  asyncHandler(async (req, res) => {
    const { username, userId, message } = req.body as { username?: string; userId?: string; message?: string };
    if (!username && !userId) throw ApiError.badRequest('Provide username or userId');
    let targetUsername = username;
    if (!targetUsername && userId) {
      const row = getPublicUserById(req.user!.id, userId);
      targetUsername = row.username;
    }
    sendFriendRequest(req.user!.id, targetUsername!, message);
    created(res, { sent: true });
  }),
);

router.post(
  '/requests/:id/accept',
  validateParams(z.object({ id: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    acceptFriendRequest(req.user!.id, req.params.id);
    ok(res, { accepted: true });
  }),
);

router.delete(
  '/requests/:id',
  validateParams(z.object({ id: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    // Handles both cancel (outgoing) and reject (incoming).
    const userId = req.user!.id;
    try {
      cancelFriendRequest(userId, req.params.id);
      ok(res, { cancelled: true });
    } catch {
      rejectFriendRequest(userId, req.params.id);
      ok(res, { rejected: true });
    }
  }),
);

router.delete(
  '/:id',
  validateParams(idParam),
  asyncHandler(async (req, res) => {
    removeFriend(req.user!.id, req.params.id);
    ok(res, { removed: true });
  }),
);

router.post(
  '/:id/block',
  validateParams(idParam),
  asyncHandler(async (req, res) => {
    // :id may be a user id or a username; resolve username form first.
    const maybeUser = getUserRowByUsername(req.params.id);
    const targetId = maybeUser ? (maybeUser.id as string) : req.params.id;
    blockUser(req.user!.id, targetId);
    ok(res, { blocked: true });
  }),
);

router.delete(
  '/:id/block',
  validateParams(idParam),
  asyncHandler(async (req, res) => {
    unblockUser(req.user!.id, req.params.id);
    ok(res, { unblocked: true });
  }),
);

router.get(
  '/blocked',
  asyncHandler(async (req, res) => {
    ok(res, { items: listBlocks(req.user!.id) });
  }),
);

router.get(
  '/search',
  validateQuery(searchSchema),
  asyncHandler(async (req, res) => {
    const page = parsePagination(req.query);
    ok(res, searchUsers(req.user!.id, (req.query as { q: string }).q, page));
  }),
);

export default router;
