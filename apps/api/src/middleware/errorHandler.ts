import type { NextFunction, Request, Response } from 'express';
import { ErrorCode, type ApiError } from '@manas/shared';
import { AppError, translateDatabaseError } from '../utils/errors';
import { logger } from '../utils/logger';
import { isProduction } from '../config/env';

export function notFoundHandler(req: Request, res: Response): void {
  const body: ApiError = {
    success: false,
    error: {
      code: ErrorCode.NOT_FOUND,
      message: `No route matches ${req.method} ${req.path}.`,
    },
  };
  res.status(404).json(body);
}

/**
 * The single exit point for every failure. Stack traces and raw database
 * messages are logged but never sent to the client (PRD §32).
 */
export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const appError = error instanceof AppError ? error : translateDatabaseError(error);

  if (appError) {
    if (appError.statusCode >= 500) {
      logger.error({ err: error, requestId: req.requestId }, 'Request failed');
    } else {
      logger.warn(
        {
          requestId: req.requestId,
          code: appError.code,
          userId: req.auth?.userId,
          path: req.path,
        },
        'Request rejected',
      );
    }

    const body: ApiError = {
      success: false,
      error: {
        code: appError.code,
        message: appError.message,
        ...(appError.details ? { details: appError.details } : {}),
      },
    };

    res.status(appError.statusCode).json(body);
    return;
  }

  logger.error(
    { err: error, requestId: req.requestId, path: req.path, userId: req.auth?.userId },
    'Unhandled error',
  );

  const body: ApiError = {
    success: false,
    error: {
      code: ErrorCode.INTERNAL_ERROR,
      message: isProduction
        ? 'Something went wrong. Please try again.'
        : `Unhandled error: ${error instanceof Error ? error.message : String(error)}`,
    },
  };

  res.status(500).json(body);
}
