import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { ErrorCode } from '@manas/shared';
import { env } from '../config/env';

export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers['x-request-id'];
  const requestId = typeof incoming === 'string' && incoming.length <= 64 ? incoming : randomUUID();

  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
}

/**
 * Global rate limit. Keyed by authenticated user where possible so one busy
 * branch cannot exhaust the budget for everyone behind the same NAT.
 */
export const apiRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.auth?.userId ?? req.ip ?? 'unknown',
  message: {
    success: false,
    error: {
      code: ErrorCode.RATE_LIMITED,
      message: 'Too many requests. Please slow down and try again shortly.',
    },
  },
});

/** Tighter budget for endpoints that can be abused for enumeration. */
export const sensitiveRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.auth?.userId ?? req.ip ?? 'unknown',
  message: {
    success: false,
    error: {
      code: ErrorCode.RATE_LIMITED,
      message: 'Too many requests. Please slow down and try again shortly.',
    },
  },
});
