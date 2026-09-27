import type { RequestHandler } from 'express';
import { config } from '../config/env.js';
import { resolveSession } from '../services/auth.service.js';
import { ApiError } from '../lib/apiError.js';

function extractToken(req: { cookies?: Record<string, unknown>; headers: Record<string, unknown> }): string | null {
  const cookieToken = req.cookies?.[config.cookieName];
  if (typeof cookieToken === 'string' && cookieToken.length > 0) return cookieToken;
  const auth = req.headers.authorization;
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

/** Hard gate — 401 when not signed in. */
export const requireAuth: RequestHandler = (req, _res, next) => {
  const token = extractToken(req);
  if (!token) return next(ApiError.unauthorized());
  const user = resolveSession(token);
  if (!user) return next(ApiError.unauthorized('Session invalid or expired'));
  req.user = user;
  next();
};

/** Soft gate — attaches req.user when a valid session exists, never errors. */
export const optionalAuth: RequestHandler = (req, _res, next) => {
  const token = extractToken(req);
  if (token) {
    const user = resolveSession(token);
    if (user) req.user = user;
  }
  next();
};
