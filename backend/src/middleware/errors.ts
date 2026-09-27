import type { ErrorRequestHandler } from 'express';
import { ApiError } from '../lib/apiError.js';
import { config } from '../config/env.js';

export function notFoundHandler(): ErrorRequestHandler {
  return (req, _res, _next) => {
    throw new ApiError(404, 'NOT_FOUND', `Route ${req.method} ${req.path} not found`);
  };
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  // Multer upload errors → friendly API errors.
  if (err && typeof err === 'object' && 'code' in err && typeof (err as { code?: unknown }).code === 'string') {
    const code = (err as { code: string }).code;
    if (code === 'LIMIT_FILE_SIZE') {
      err = ApiError.payloadTooLarge('File exceeds the maximum allowed size');
    } else if (code === 'LIMIT_UNEXPECTED_FILE') {
      err = ApiError.badRequest('Unexpected file field');
    }
  }

  if (err instanceof ApiError) {
    res.status(err.status).json({
      success: false as const,
      data: null,
      error: { code: err.code, message: err.message, ...(err.details !== undefined ? { details: err.details } : {}) },
    });
    return;
  }

  // Unexpected errors — log internally, return a safe generic message.
  if (!config.isProd) {
    console.error(`[error] ${req.method} ${req.path}:`, err);
  } else {
    console.error(`[error] ${req.method} ${req.path}: ${err instanceof Error ? err.message : String(err)}`);
  }
  res.status(500).json({
    success: false as const,
    data: null,
    error: {
      code: 'INTERNAL_ERROR',
      message: config.isProd ? 'Internal server error' : (err instanceof Error ? err.message : String(err)),
    },
  });
};
