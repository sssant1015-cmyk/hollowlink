import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type ZodSchema } from 'zod';
import { ApiError } from '../lib/apiError.js';

export interface AuthedRequest extends Request {
  user?: {
    id: string;
    username: string;
    displayName: string;
    role: 'user' | 'admin';
    avatarUrl: string | null;
  };
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthedRequest['user'];
    }
  }
}

/** Validate req.body against a zod schema; replaces it with the parsed (coerced/stripped) value. */
export function validateBody(schema: ZodSchema): RequestHandler {
  return (req, _res, next) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      next(toValidationError(err));
    }
  };
}

export function validateQuery(schema: ZodSchema): RequestHandler {
  return (req, _res, next) => {
    try {
      req.query = schema.parse(req.query);
      next();
    } catch (err) {
      next(toValidationError(err));
    }
  };
}

export function validateParams(schema: ZodSchema): RequestHandler {
  return (req, _res, next) => {
    try {
      req.params = schema.parse(req.params);
      next();
    } catch (err) {
      next(toValidationError(err));
    }
  };
}

function toValidationError(err: unknown): ApiError {
  if (err instanceof ZodError) {
    const first = err.issues[0];
    return new ApiError(400, 'VALIDATION_ERROR', first ? `${first.path.join('.') || 'body'}: ${first.message}` : 'Invalid request', {
      issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  return ApiError.badRequest('Invalid request');
}

/** Wrap async route handlers so rejections hit the error middleware. */
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
