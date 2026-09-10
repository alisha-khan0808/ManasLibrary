import { Router } from 'express';
import { Permission } from '@manas/shared';
import { asyncHandler } from '../../middleware/asyncHandler';
import { getAuth } from '../../middleware/auth';
import { idParamSchema, validate } from '../../middleware/validate';
import { requirePermission } from '../../guards/rbac';
import { sensitiveRateLimiter } from '../../middleware/requestContext';
import { created, ok, paginated } from '../../utils/response';
import * as service from './users.service';
import { createUserSchema, listUsersSchema, updateUserSchema } from './users.schema';

export const usersRouter = Router();

usersRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    const user = await service.getCurrentUser(getAuth(req));
    return ok(res, user, 'Profile retrieved successfully');
  }),
);

usersRouter.get(
  '/',
  requirePermission(Permission.USER_MANAGE),
  validate({ query: listUsersSchema }),
  asyncHandler(async (req, res) => {
    const result = await service.listUsers(getAuth(req), req.query as never);
    return paginated(res, result.data, result.meta, 'Users retrieved successfully');
  }),
);

usersRouter.post(
  '/',
  requirePermission(Permission.USER_MANAGE),
  sensitiveRateLimiter,
  validate({ body: createUserSchema }),
  asyncHandler(async (req, res) => {
    const user = await service.createUser(getAuth(req), req.body);
    // Creating an account sends no mail, so the message says what the
    // administrator actually has to do next rather than implying an email.
    return created(
      res,
      user,
      req.body.password
        ? 'User created. They can sign in with the password you set.'
        : 'User created. Ask them to use “Forgot your password?” to set one.',
    );
  }),
);

usersRouter.get(
  '/:id',
  requirePermission(Permission.USER_MANAGE),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const user = await service.getUser(getAuth(req), req.params.id!);
    return ok(res, user, 'User retrieved successfully');
  }),
);

usersRouter.patch(
  '/:id',
  requirePermission(Permission.USER_MANAGE),
  validate({ params: idParamSchema, body: updateUserSchema }),
  asyncHandler(async (req, res) => {
    const user = await service.updateUser(getAuth(req), req.params.id!, req.body);
    return ok(res, user, 'User updated successfully');
  }),
);
