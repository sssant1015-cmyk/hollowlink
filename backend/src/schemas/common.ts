import { z } from 'zod';

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const searchSchema = paginationSchema.extend({
  q: z.string().trim().min(1).max(64),
});

export const idParam = z.object({ id: z.string().min(1).max(64) });

export const emojiSchema = z.string().min(1).max(16);
