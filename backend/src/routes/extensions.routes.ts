import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { validateBody, validateParams, asyncHandler } from '../middleware/validate.js';
import { idParam } from '../schemas/common.js';
import { ok } from './respond.js';
import {
  listExtensions,
  enableExtension,
  disableExtension,
  setExtensionSettings,
} from '../services/extensions.service.js';

const router = Router();
router.use(requireAuth);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    ok(res, listExtensions(req.user!.id));
  }),
);

router.post(
  '/:id/enable',
  validateParams(idParam),
  validateBody(z.object({ permissions: z.array(z.string().max(32)).max(16).optional() })),
  asyncHandler(async (req, res) => {
    const { permissions } = req.body as { permissions?: string[] };
    ok(res, enableExtension(req.user!.id, req.params.id, permissions));
  }),
);

router.post(
  '/:id/disable',
  validateParams(idParam),
  asyncHandler(async (req, res) => {
    disableExtension(req.user!.id, req.params.id);
    ok(res, { disabled: true });
  }),
);

router.put(
  '/:id/settings',
  validateParams(idParam),
  validateBody(z.object({ settings: z.record(z.unknown()) })),
  asyncHandler(async (req, res) => {
    const { settings } = req.body as { settings: Record<string, unknown> };
    ok(res, { settings: setExtensionSettings(req.user!.id, req.params.id, settings) });
  }),
);

export default router;
