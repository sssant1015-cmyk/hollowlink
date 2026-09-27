import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { validateBody, validateParams, validateQuery, asyncHandler } from '../middleware/validate.js';
import { paginationSchema } from '../schemas/common.js';
import { ok, created } from './respond.js';
import { parsePagination } from '../lib/pagination.js';
import { ApiError } from '../lib/apiError.js';
import {
  homeFeed,
  groupFeed,
  userPosts,
  createPost,
  getPostOrThrow,
  editPost,
  deletePost,
  createComment,
  listComments,
  editComment,
  deleteComment,
  react,
} from '../services/feed.service.js';
import { imageUpload } from '../middleware/upload.js';

const router = Router();

const postImages = imageUpload({ kind: 'posts', maxBytes: 8 * 1024 * 1024 });

const postBody = z.object({
  content: z.string().min(1).max(4000),
  groupId: z.string().max(64).nullable().optional(),
  mediaUrls: z.array(z.string().max(300)).max(4).optional(),
});

// Public feed is not a thing in HollowLink; feed requires auth.
router.use(requireAuth);

router.get(
  '/',
  validateQuery(paginationSchema),
  asyncHandler(async (req, res) => {
    ok(res, homeFeed(req.user!.id, parsePagination(req.query)));
  }),
);

// Create a post (optionally with image upload in the same request).
router.post(
  '/',
  (req, res, next) => {
    postImages.single('image')(req, res, (err) => next(err));
  },
  asyncHandler(async (req, res) => {
    const body = typeof req.body.content === 'string' ? req.body : {};
    const parsed = postBody.parse({
      content: body.content,
      groupId: body.groupId || null,
      mediaUrls: body.mediaUrls ? JSON.parse(body.mediaUrls) : undefined,
    });
    const media = req.file ? [postImages.save(req.file)] : [];
    if (parsed.groupId && !isGroupId(parsed.groupId)) {
      // Allow group "codes" for UX convenience? No — strict ids only.
      throw ApiError.badRequest('Invalid group');
    }
    created(res, createPost(req.user!.id, { ...parsed, media }));
  }),
);

function isGroupId(id: string): boolean {
  return id.length >= 8;
}

router.get(
  '/users/:id',
  validateParams(z.object({ id: z.string().min(1) })),
  validateQuery(paginationSchema),
  asyncHandler(async (req, res) => {
    ok(res, userPosts(req.user!.id, req.params.id, parsePagination(req.query)));
  }),
);

router.get(
  '/groups/:id',
  validateParams(z.object({ id: z.string().min(1) })),
  validateQuery(paginationSchema),
  asyncHandler(async (req, res) => {
    ok(res, groupFeed(req.user!.id, req.params.id, parsePagination(req.query)));
  }),
);

router.get(
  '/posts/:id',
  validateParams(z.object({ id: z.string().min(1) })),
  optionalAuth,
  asyncHandler(async (req, res) => {
    ok(res, getPostOrThrow(req.user?.id, req.params.id));
  }),
);

router.patch(
  '/posts/:id',
  validateParams(z.object({ id: z.string().min(1) })),
  validateBody(z.object({ content: z.string().min(1).max(4000) })),
  asyncHandler(async (req, res) => {
    ok(res, editPost(req.user!.id, req.params.id, req.body.content));
  }),
);

router.delete(
  '/posts/:id',
  validateParams(z.object({ id: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    deletePost(req.user!.id, req.params.id, req.user!.role === 'admin');
    ok(res, { deleted: true });
  }),
);

router.get(
  '/posts/:id/comments',
  validateParams(z.object({ id: z.string().min(1) })),
  validateQuery(paginationSchema),
  asyncHandler(async (req, res) => {
    ok(res, listComments(req.user!.id, req.params.id, parsePagination(req.query)));
  }),
);

router.post(
  '/posts/:id/comments',
  validateParams(z.object({ id: z.string().min(1) })),
  validateBody(z.object({ content: z.string().min(1).max(1000) })),
  asyncHandler(async (req, res) => {
    created(res, createComment(req.user!.id, req.params.id, req.body.content));
  }),
);

router.patch(
  '/comments/:id',
  validateParams(z.object({ id: z.string().min(1) })),
  validateBody(z.object({ content: z.string().min(1).max(1000) })),
  asyncHandler(async (req, res) => {
    ok(res, editComment(req.user!.id, req.params.id, req.body.content));
  }),
);

router.delete(
  '/comments/:id',
  validateParams(z.object({ id: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    deleteComment(req.user!.id, req.params.id, req.user!.role === 'admin');
    ok(res, { deleted: true });
  }),
);

router.post(
  '/reactions',
  validateBody(z.object({ targetType: z.enum(['post', 'comment']), targetId: z.string().min(1), emoji: z.string().min(1).max(8) })),
  asyncHandler(async (req, res) => {
    react(req.user!.id, req.body.targetType, req.body.targetId, req.body.emoji);
    ok(res, { toggled: true });
  }),
);

export default router;
