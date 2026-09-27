import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { validateBody, validateParams, validateQuery, asyncHandler } from '../middleware/validate.js';
import { paginationSchema, searchSchema } from '../schemas/common.js';
import { ok, created } from './respond.js';
import { parsePagination } from '../lib/pagination.js';
import { ApiError } from '../lib/apiError.js';
import { getDb } from '../db/connection.js';
import {
  createGroup,
  updateGroup,
  deleteGroup,
  getGroupOrThrow,
  toPublicGroup,
  listUserGroups,
  discoverGroups,
  joinGroup,
  leaveGroup,
  removeMember,
  setMemberRole,
  listMembers,
  requireMember,
  inviteFriendToGroup,
  joinByInviteCode,
  rotateInviteCode,
  createAnnouncement,
  listAnnouncements,
  deleteAnnouncement,
  getMemberRow,
  type GroupRole,
} from '../services/groups.service.js';
import { imageUpload } from '../middleware/upload.js';

const router = Router();
router.use(requireAuth);

const groupImages = imageUpload({ kind: 'groups' });

const createGroupSchema = z.object({
  name: z.string().min(2).max(48),
  description: z.string().max(500).optional(),
  isPrivate: z.boolean().optional().default(true),
});

const nameParam = z.object({ id: z.string().min(1) });

router.post(
  '/',
  validateBody(createGroupSchema),
  asyncHandler(async (req, res) => {
    const group = createGroup(req.user!.id, req.body);
    created(res, toPublicGroup(group, req.user!.id));
  }),
);

router.get(
  '/discover',
  validateQuery(searchSchema.partial({ q: true })),
  asyncHandler(async (req, res) => {
    const page = parsePagination(req.query);
    const q = (req.query as { q?: string }).q;
    ok(res, discoverGroups(req.user!.id, q, page));
  }),
);

router.get(
  '/',
  validateQuery(paginationSchema),
  asyncHandler(async (req, res) => {
    const page = parsePagination(req.query);
    ok(res, listUserGroups(req.user!.id, page));
  }),
);

router.post(
  '/join',
  validateBody(z.object({ code: z.string().min(4).max(64) })),
  asyncHandler(async (req, res) => {
    ok(res, joinByInviteCode(req.user!.id, req.body.code));
  }),
);

router.get(
  '/:id',
  validateParams(nameParam),
  asyncHandler(async (req, res) => {
    const group = getGroupOrThrow(req.params.id);
    const member = getMemberRow(group.id, req.user!.id);
    if (group.is_private && !member) throw ApiError.forbidden('This group is private');
    ok(res, toPublicGroup(group, req.user!.id));
  }),
);

router.patch(
  '/:id',
  validateParams(nameParam),
  validateBody(createGroupSchema.partial()),
  asyncHandler(async (req, res) => {
    const group = getGroupOrThrow(req.params.id);
    if (group.owner_id !== req.user!.id) throw ApiError.forbidden('Only the owner can update the group');
    updateGroup(group.id, req.body);
    ok(res, toPublicGroup(getGroupOrThrow(group.id), req.user!.id));
  }),
);

router.delete(
  '/:id',
  validateParams(nameParam),
  asyncHandler(async (req, res) => {
    const group = getGroupOrThrow(req.params.id);
    if (group.owner_id !== req.user!.id) throw ApiError.forbidden('Only the owner can delete the group');
    deleteGroup(group.id);
    ok(res, { deleted: true });
  }),
);

router.post(
  '/:id/leave',
  validateParams(nameParam),
  asyncHandler(async (req, res) => {
    leaveGroup(req.params.id, req.user!.id);
    ok(res, { left: true });
  }),
);

router.post(
  '/:id/join',
  validateParams(nameParam),
  asyncHandler(async (req, res) => {
    joinGroup(req.user!.id, req.params.id);
    ok(res, toPublicGroup(getGroupOrThrow(req.params.id), req.user!.id));
  }),
);

router.get(
  '/:id/members',
  validateParams(nameParam),
  validateQuery(paginationSchema),
  asyncHandler(async (req, res) => {
    const group = getGroupOrThrow(req.params.id);
    requireMember(group.id, req.user!.id);
    const page = parsePagination(req.query);
    ok(res, listMembers(group.id, page));
  }),
);

router.post(
  '/:id/invite',
  validateParams(nameParam),
  validateBody(z.object({ friendId: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const result = inviteFriendToGroup(req.user!.id, req.params.id, req.body.friendId);
    created(res, result);
  }),
);

router.post(
  '/:id/rotate-invite',
  validateParams(nameParam),
  asyncHandler(async (req, res) => {
    ok(res, rotateInviteCode(req.user!.id, req.params.id));
  }),
);

router.post(
  '/:id/members/:memberId/remove',
  validateParams(z.object({ id: z.string().min(1), memberId: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    removeMember(req.user!.id, req.params.id, req.params.memberId);
    ok(res, { removed: true });
  }),
);

router.post(
  '/:id/members/:memberId/role',
  validateParams(z.object({ id: z.string().min(1), memberId: z.string().min(1) })),
  validateBody(z.object({ role: z.enum(['moderator', 'member', 'owner']) })),
  asyncHandler(async (req, res) => {
    setMemberRole(req.user!.id, req.params.id, req.params.memberId, req.body.role as GroupRole);
    ok(res, { updated: true });
  }),
);

// Announcements
router.get(
  '/:id/announcements',
  validateParams(nameParam),
  validateQuery(paginationSchema),
  asyncHandler(async (req, res) => {
    const group = getGroupOrThrow(req.params.id);
    requireMember(group.id, req.user!.id);
    ok(res, listAnnouncements(group.id, parsePagination(req.query)));
  }),
);

router.post(
  '/:id/announcements',
  validateParams(nameParam),
  validateBody(z.object({ title: z.string().min(2).max(120), body: z.string().min(1).max(4000), imageUrl: z.string().max(300).optional() })),
  asyncHandler(async (req, res) => {
    created(res, createAnnouncement(req.user!.id, req.params.id, req.body));
  }),
);

router.delete(
  '/:id/announcements/:announcementId',
  validateParams(z.object({ id: z.string().min(1), announcementId: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    deleteAnnouncement(req.user!.id, req.params.id, req.params.announcementId);
    ok(res, { deleted: true });
  }),
);

// Group icon/banner uploads
router.post(
  '/:id/icon',
  validateParams(nameParam),
  (req, res, next) => {
    groupImages.single('icon')(req, res, (err) => next(err));
  },
  asyncHandler(async (req, res) => {
    const group = getGroupOrThrow(req.params.id);
    if (group.owner_id !== req.user!.id) throw ApiError.forbidden('Only the owner can update the icon');
    const { url } = groupImages.save(req.file);
    setGroupIconUrl(group.id, url);
    ok(res, { iconUrl: url });
  }),
);

router.post(
  '/:id/banner',
  validateParams(nameParam),
  (req, res, next) => {
    groupImages.single('banner')(req, res, (err) => next(err));
  },
  asyncHandler(async (req, res) => {
    const group = getGroupOrThrow(req.params.id);
    if (group.owner_id !== req.user!.id) throw ApiError.forbidden('Only the owner can update the banner');
    const { url } = groupImages.save(req.file);
    setGroupBannerUrl(group.id, url);
    ok(res, { bannerUrl: url });
  }),
);

function setGroupIconUrl(groupId: string, url: string): void {
  getDb().prepare('UPDATE groups SET icon_url = ?, updated_at = ? WHERE id = ?').run(url, new Date().toISOString(), groupId);
}

function setGroupBannerUrl(groupId: string, url: string): void {
  getDb().prepare('UPDATE groups SET banner_url = ?, updated_at = ? WHERE id = ?').run(url, new Date().toISOString(), groupId);
}

export default router;
