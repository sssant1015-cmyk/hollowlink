import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { validateBody, asyncHandler } from '../middleware/validate.js';
import { ok } from './respond.js';
import {
  getPreferences,
  savePreferences,
  deletePreferences,
  appearanceSchema,
  accessibilitySchema,
  layoutSchema,
} from '../services/preferences.service.js';

const router = Router();
router.use(requireAuth);

const prefsBodySchema = z.object({
  appearance: appearanceSchema.partial().optional(),
  accessibility: accessibilitySchema.partial().optional(),
  layout: layoutSchema.partial().optional(),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    ok(res, { preferences: getPreferences(req.user!.id) });
  }),
);

router.put(
  '/',
  validateBody(prefsBodySchema),
  asyncHandler(async (req, res) => {
    // Merge partial update over current values so clients can PATCH-style save.
    const current = getPreferences(req.user!.id);
    const body = req.body as { appearance?: Record<string, unknown>; accessibility?: Record<string, unknown>; layout?: Record<string, unknown> };
    const saved = savePreferences(req.user!.id, {
      appearance: { ...current.appearance, ...(body.appearance ?? {}) },
      accessibility: { ...current.accessibility, ...(body.accessibility ?? {}) },
      layout: { ...current.layout, ...(body.layout ?? {}) },
    });
    ok(res, { preferences: saved });
  }),
);

router.delete(
  '/',
  asyncHandler(async (req, res) => {
    deletePreferences(req.user!.id);
    ok(res, { reset: true });
  }),
);

export default router;
