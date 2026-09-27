export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message = 'Invalid request', details?: unknown) {
    return new ApiError(400, 'BAD_REQUEST', message, details);
  }
  static unauthorized(message = 'Authentication required') {
    return new ApiError(401, 'UNAUTHORIZED', message);
  }
  static forbidden(message = 'You do not have permission to do that') {
    return new ApiError(403, 'FORBIDDEN', message);
  }
  static notFound(message = 'Resource not found') {
    return new ApiError(404, 'NOT_FOUND', message);
  }
  static conflict(message = 'Resource already exists') {
    return new ApiError(409, 'CONFLICT', message);
  }
  static payloadTooLarge(message = 'Payload too large') {
    return new ApiError(413, 'PAYLOAD_TOO_LARGE', message);
  }
  static unsupportedMedia(message = 'Unsupported media type') {
    return new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', message);
  }
  static tooMany(message = 'Too many requests, slow down') {
    return new ApiError(429, 'RATE_LIMITED', message);
  }
}
