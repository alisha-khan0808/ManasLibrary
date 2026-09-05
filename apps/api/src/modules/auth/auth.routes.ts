import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { getAuth, requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { sensitiveRateLimiter } from '../../middleware/requestContext';
import { ok } from '../../utils/response';
import { getCurrentUser, sendPasswordReset } from '../users/users.service';
import { passwordResetSchema } from '../users/users.schema';

/**
 * Sign-in and sign-out happen directly against Supabase Auth from the browser,
 * so this router only covers the parts the backend must own: identity
 * introspection and password recovery.
 */
export const authRouter = Router();

authRouter.get(
  '/session',
  requireAuth,
  asyncHandler(async (req, res) => {
    const auth = getAuth(req);
    const user = await getCurrentUser(auth);
    return ok(
      res,
      { user, role: auth.role, branchIds: auth.branchIds },
      'Session retrieved successfully',
    );
  }),
);

authRouter.post(
  '/password-reset',
  sensitiveRateLimiter,
  validate({ body: passwordResetSchema }),
  asyncHandler(async (req, res) => {
    await sendPasswordReset(req.body.email, req.body.redirectTo);
    // Deliberately unconditional: revealing whether an address has an account
    // would turn this endpoint into a user enumeration oracle.
    return ok(
      res,
      null,
      'If an account exists for that address, a reset link has been sent.',
    );
  }),
);
