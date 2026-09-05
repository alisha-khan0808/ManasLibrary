import type { NextFunction, Request, Response } from 'express';
import { hasPermission, type Permission, type UserRole } from '@manas/shared';
import { getAuth } from '../middleware/auth';
import { forbidden } from '../utils/errors';

/**
 * Route-level role and permission checks. These run after requireAuth and
 * before any handler; the frontend's copy of the same rules is cosmetic.
 */

export function requirePermission(...permissions: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const auth = getAuth(req);
      const granted = permissions.every((permission) => hasPermission(auth.role, permission));

      if (!granted) {
        next(
          forbidden(
            `Your role (${auth.role}) is not permitted to perform this action.`,
          ),
        );
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const auth = getAuth(req);

      if (!roles.includes(auth.role)) {
        next(forbidden('Your role is not permitted to perform this action.'));
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
