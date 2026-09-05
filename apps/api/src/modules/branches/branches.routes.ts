import { Router } from 'express';
import { Permission } from '@manas/shared';
import { asyncHandler } from '../../middleware/asyncHandler';
import { getAuth } from '../../middleware/auth';
import { idParamSchema, validate } from '../../middleware/validate';
import { requirePermission } from '../../guards/rbac';
import { created, ok, paginated } from '../../utils/response';
import * as service from './branches.service';
import {
  branchStatusSchema,
  createBranchSchema,
  listBranchesSchema,
  updateBranchSchema,
} from './branches.schema';

export const branchesRouter = Router();

branchesRouter.get(
  '/',
  validate({ query: listBranchesSchema }),
  asyncHandler(async (req, res) => {
    const result = await service.listBranches(getAuth(req), req.query as never);
    return paginated(res, result.data, result.meta, 'Branches retrieved successfully');
  }),
);

branchesRouter.post(
  '/',
  requirePermission(Permission.BRANCH_MANAGE),
  validate({ body: createBranchSchema }),
  asyncHandler(async (req, res) => {
    const branch = await service.createBranch(getAuth(req), req.body);
    return created(res, branch, 'Branch created successfully');
  }),
);

branchesRouter.get(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const branch = await service.getBranch(getAuth(req), req.params.id!);
    return ok(res, branch, 'Branch retrieved successfully');
  }),
);

branchesRouter.get(
  '/:id/stats',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const stats = await service.getBranchStats(getAuth(req), req.params.id!);
    return ok(res, stats, 'Branch statistics retrieved successfully');
  }),
);

branchesRouter.patch(
  '/:id',
  requirePermission(Permission.BRANCH_MANAGE),
  validate({ params: idParamSchema, body: updateBranchSchema }),
  asyncHandler(async (req, res) => {
    const branch = await service.updateBranch(getAuth(req), req.params.id!, req.body);
    return ok(res, branch, 'Branch updated successfully');
  }),
);

branchesRouter.post(
  '/:id/status',
  requirePermission(Permission.BRANCH_MANAGE),
  validate({ params: idParamSchema, body: branchStatusSchema }),
  asyncHandler(async (req, res) => {
    const branch = await service.updateBranch(getAuth(req), req.params.id!, {
      status: req.body.status,
    });
    return ok(res, branch, `Branch marked ${req.body.status.toLowerCase()}`);
  }),
);
