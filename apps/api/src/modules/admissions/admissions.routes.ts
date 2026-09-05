import { Router } from 'express';
import { z } from 'zod';
import { Permission } from '@manas/shared';
import { asyncHandler } from '../../middleware/asyncHandler';
import { getAuth } from '../../middleware/auth';
import { idParamSchema, validate } from '../../middleware/validate';
import { requirePermission } from '../../guards/rbac';
import { created, ok, paginated } from '../../utils/response';
import * as service from './admissions.service';
import {
  createAdmissionSchema,
  listAdmissionsSchema,
  quoteAdmissionSchema,
  renewalsSchema,
} from './admissions.schema';

export const admissionsRouter = Router();

admissionsRouter.get(
  '/',
  requirePermission(Permission.ADMISSION_MANAGE),
  validate({ query: listAdmissionsSchema }),
  asyncHandler(async (req, res) => {
    const result = await service.listAdmissions(getAuth(req), req.query as never);
    return paginated(res, result.data, result.meta, 'Admissions retrieved successfully');
  }),
);

admissionsRouter.post(
  '/quote',
  requirePermission(Permission.ADMISSION_MANAGE),
  validate({ body: quoteAdmissionSchema }),
  asyncHandler(async (req, res) => {
    const quote = await service.quoteAdmission(getAuth(req), req.body);
    return ok(res, quote, 'Admission quote calculated successfully');
  }),
);

admissionsRouter.post(
  '/',
  requirePermission(Permission.ADMISSION_MANAGE),
  validate({ body: createAdmissionSchema }),
  asyncHandler(async (req, res) => {
    const result = await service.createAdmission(getAuth(req), req.body);
    return created(res, result, 'Admission completed successfully');
  }),
);

admissionsRouter.get(
  '/renewals',
  requirePermission(Permission.ADMISSION_MANAGE),
  validate({ query: renewalsSchema }),
  asyncHandler(async (req, res) => {
    const renewals = await service.upcomingRenewals(getAuth(req), req.query as never);
    return ok(res, renewals, 'Upcoming renewals retrieved successfully');
  }),
);

admissionsRouter.get(
  '/:id',
  requirePermission(Permission.ADMISSION_MANAGE),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const result = await service.getAdmission(getAuth(req), req.params.id!);
    return ok(res, result, 'Admission retrieved successfully');
  }),
);

admissionsRouter.post(
  '/:id/cancel',
  requirePermission(Permission.ADMISSION_MANAGE),
  validate({
    params: idParamSchema,
    body: z.object({ reason: z.string().trim().min(3).max(300) }),
  }),
  asyncHandler(async (req, res) => {
    const admission = await service.cancelAdmission(
      getAuth(req),
      req.params.id!,
      req.body.reason,
    );
    return ok(res, admission, 'Admission cancelled successfully');
  }),
);
