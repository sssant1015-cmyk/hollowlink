import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { validateBody, validateParams, asyncHandler } from '../middleware/validate.js';
import { ok } from './respond.js';
import {
  getUserOrThrow,
  toPublicUser,
  toFullUser,
  updateUser,
  assertCanViewProfile,
  areFriends,
} from '../services/users.service.js';
import { imageUpload } from '../middleware/upload.js';

const router = Router();
router.use(requireAuth);

const avatarUpload = imageUpload({ kind: 'avatars', maxBytes: 3 * 1024 * 1024 });

const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(48).optional(),
  bio: z.string().max(500).optional(),
  pronouns: z.string().max(32).nullable().optional(),
  location: z.string().max(64).nullable().optional(),
  customStatus: z.string().max(80).nullable().optional(),
  privacyProfile: z.enum(['public', 'friends', 'private']).optional(),
  privacyPresence: z.enum(['public', 'friends', 'private']).optional(),
});

router.get(
  '/me',
  asyncHandler(async (req, res) => {
    ok(res, { user: toFullUser(getUserOrThrow(req.user!.id)) });
  }),
);

router.patch(
  '/me',
  validateBody(updateProfileSchema),
  asyncHandler(async (req, res) => {
    ok(res, { user: updateUser(req.user!.id, req.body) });
  }),
);

router.post(
  '/me/avatar',
  (req, res, next) => {
    avatarUpload.single('avatar')(req, res, (err) => next(err));
  },
  asyncHandler(async (req, res) => {
    const { url } = avatarUpload.save(req.file);
    updateUser(req.user!.id, { avatarUrl: url });
    ok(res, { avatarUrl: url });
  }),
);

router.get(
  '/:id',
  validateParams(z.object({ id: z.string().min(1) })),
  optionalAuth,
  asyncHandler(async (req, res) => {
    const row = getUserOrThrow(req.params.id);
    assertCanViewProfile(req.user?.id, row);
    const full = toFullUser(row);
    const isSelf = req.user?.id === (row.id as string);
    const isFriend = req.user ? areFriends(req.user.id, row.id as string) : false;
    ok(res, {
      user: isSelf
        ? full
        : {
            ...toPublicUser(row),
            bio: full.privacyProfile === 'public' || isFriend ? full.bio : '',
            location: full.privacyProfile === 'public' || isFriend ? full.location : null,
            createdAt: full.createdAt,
            privacyProfile: full.privacyProfile,
          },
      isSelf,
      isFriend,
    });
  }),
);

export default router;
