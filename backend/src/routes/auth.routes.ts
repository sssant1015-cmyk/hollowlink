import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config/env.js';
import {
  login,
  register,
  revokeSession,
  revokeAllSessions,
  changeOwnPassword,
  decodeJwt,
} from '../services/auth.service.js';
import {
  getUserRowById,
  getUserRowByEmail,
  toFullUser,
  hashPassword,
  applyPasswordHash,
  verifyPassword,
  createPasswordResetToken,
  consumePasswordResetToken,
  deleteUser,
} from '../services/users.service.js';
import { createNotification } from '../services/notifications.service.js';
import { requireAuth } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { validateBody } from '../middleware/validate.js';
import { ApiError } from '../lib/apiError.js';
import { timingSafeEqualStr } from '../lib/crypto.js';
import { ok, created } from './respond.js';

const router = Router();

const usernameSchema = z
  .string()
  .min(3, 'at least 3 characters')
  .max(24, 'at most 24 characters')
  .regex(/^[a-z0-9_]+$/i, 'letters, numbers and underscore only');

const passwordSchema = z
  .string()
  .min(10, 'at least 10 characters')
  .max(128, 'at most 128 characters')
  .regex(/[a-zA-Z]/, 'must contain a letter')
  .regex(/[0-9]/, 'must contain a digit');

const registerSchema = z.object({
  username: usernameSchema,
  email: z.string().email().max(254),
  password: passwordSchema,
  displayName: z.string().min(1).max(48),
  inviteCode: z.string().max(128).optional(),
});

const loginSchema = z.object({
  identifier: z.string().min(1).max(254),
  password: z.string().min(1).max(128),
});

// Public: tells the signup form whether an invite code field is needed.
router.get('/registration-config', (_req, res) => {
  ok(res, { inviteRequired: Boolean(config.registrationInviteCode) });
});

router.post('/register', authLimiter, validateBody(registerSchema), (req, res, next) => {
  try {
    // Invite gate: when configured, registration needs the exact code. Timing-safe compare.
    if (config.registrationInviteCode) {
      const provided = typeof req.body.inviteCode === 'string' ? req.body.inviteCode : '';
      if (!timingSafeEqualStr(provided, config.registrationInviteCode)) {
        throw new ApiError(403, 'INVITE_REQUIRED', 'A valid invite code is required to register');
      }
    }
    const { token, user } = register(req.body, { ip: req.ip, userAgent: req.headers['user-agent'] });
    setAuthCookie(res, token);
    created(res, { token, user });
  } catch (err) {
    next(err);
  }
});

export function setAuthCookie(res: import('express').Response, token: string): void {
  res.cookie(config.cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    maxAge: 7 * 24 * 3600 * 1000,
    path: '/',
  });
}

function clearAuthCookie(res: import('express').Response): void {
  res.clearCookie(config.cookieName, { path: '/' });
}

router.post('/login', authLimiter, validateBody(loginSchema), (req, res, next) => {
  try {
    const { token, user } = login(req.body.identifier, req.body.password, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    setAuthCookie(res, token);
    ok(res, { user, token });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', requireAuth, (req, res, next) => {
  try {
    const cookieToken = (req as unknown as { cookies?: Record<string, string> }).cookies?.[config.cookieName];
    const bearer = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    const raw = cookieToken ?? bearer;
    const parsed = decodeJwt(raw);
    if (parsed) revokeSession(parsed.sid);
    clearAuthCookie(res);
    ok(res, { loggedOut: true });
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireAuth, (req, res, next) => {
  try {
    const row = getUserRowById(req.user!.id);
    if (!row) throw ApiError.unauthorized('Account no longer exists');
    ok(res, { user: toFullUser(row) });
  } catch (err) {
    next(err);
  }
});

router.post('/password', requireAuth, validateBody(
  z.object({ currentPassword: z.string().min(1), newPassword: passwordSchema }),
), (req, res, next) => {
  try {
    changeOwnPassword(req.user!.id, req.body.currentPassword, req.body.newPassword);
    clearAuthCookie(res); // all sessions revoked in service; force re-login
    ok(res, { changed: true });
  } catch (err) {
    next(err);
  }
});

router.post('/password/forgot', authLimiter, validateBody(z.object({ email: z.string().email() })), (req, res, next) => {
  try {
    // Anti-enumeration: identical response whether or not the account exists.
    const row = getUserRowByEmail(req.body.email);
    const token = row ? createPasswordResetToken(row.id as string, config.passwordResetTtlMs) : null;
    // No mailer is wired in development; the token is returned only in non-production
    // so flows are testable. In production, integrate an email provider here and do
    // NOT return the token (documented in docs/security.md).
    const payload: Record<string, unknown> = { sent: true };
    if (!config.isProd && token) payload.resetToken = token;
    ok(res, payload);
  } catch (err) {
    next(err);
  }
});

router.post('/password/reset', authLimiter, validateBody(
  z.object({ token: z.string().min(10), newPassword: passwordSchema }),
), (req, res, next) => {
  try {
    const userId = consumePasswordResetToken(req.body.token);
    applyPasswordHash(userId, hashPassword(req.body.newPassword));
    revokeAllSessions(userId);
    createNotification({ userId, type: 'system', title: 'Password reset', body: 'Your password was reset. If this was not you, contact support immediately.' });
    ok(res, { reset: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/me', requireAuth, validateBody(z.object({ password: z.string().min(1) })), (req, res, next) => {
  try {
    const row = getUserRowById(req.user!.id);
    if (!row) throw ApiError.notFound('User not found');
    if (!verifyPassword(req.body.password, row.password_hash as string)) {
      throw ApiError.badRequest('Password confirmation failed');
    }
    revokeAllSessions(req.user!.id);
    deleteUser(req.user!.id);
    clearAuthCookie(res);
    ok(res, { deleted: true });
  } catch (err) {
    next(err);
  }
});

export default router;
