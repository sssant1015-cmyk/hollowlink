import { ApiError } from './apiError.js';

export interface Page {
  limit: number;
  offset: number;
}

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

/** Parse and clamp pagination params; throws ApiError on garbage. */
export function parsePagination(query: { limit?: unknown; offset?: unknown }, max = MAX_PAGE_SIZE): Page {
  const limitRaw = query.limit ?? DEFAULT_PAGE_SIZE;
  const offsetRaw = query.offset ?? 0;
  const limit = typeof limitRaw === 'string' || typeof limitRaw === 'number' ? Number(limitRaw) : NaN;
  const offset = typeof offsetRaw === 'string' || typeof offsetRaw === 'number' ? Number(offsetRaw) : NaN;

  if (!Number.isInteger(limit) || limit < 1 || limit > max) {
    throw new ApiError(400, 'VALIDATION_ERROR', `limit must be an integer between 1 and ${max}`);
  }
  if (!Number.isInteger(offset) || offset < 0) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'offset must be a non-negative integer');
  }
  return { limit, offset };
}

/** Escape % and _ in LIKE patterns supplied by users. */
export function likeEscape(input: string): string {
  return input.replace(/[\\%_]/g, (c) => `\\${c}`);
}
