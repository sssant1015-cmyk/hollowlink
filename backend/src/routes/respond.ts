import type { Response } from 'express';

export function ok<T>(res: Response, data: T, status = 200): Response {
  return res.status(status).json({ success: true as const, data, error: null });
}

export function created<T>(res: Response, data: T): Response {
  return ok(res, data, 201);
}
