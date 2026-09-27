import rateLimit from 'express-rate-limit';
import { ApiError } from '../lib/apiError.js';
import { config } from '../config/env.js';

/** Strict limiter for login/register/reset endpoints. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => config.isTest, // integration tests create many users
  handler: (_req, _res, next) => next(ApiError.tooMany('Too many authentication attempts. Try again later.')),
});

/** General API limiter — generous, protects against runaway loops. */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => config.isTest,
  handler: (_req, _res, next) => next(ApiError.tooMany()),
});
