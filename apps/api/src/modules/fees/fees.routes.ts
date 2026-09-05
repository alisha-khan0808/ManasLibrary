import { Router } from 'express';
import { z } from 'zod';
import { FeeReminderStatus, FeeScheduleStatus, Permission } from '@manas/shared';
import { asyncHandler } from '../../middleware/asyncHandler';
import { getAuth } from '../../middleware/auth';
import { isoDateSchema, uuidSchema, validate } from '../../middleware/validate';
import { requirePermission } from '../../guards/rbac';
import { ok, paginated } from '../../utils/response';
import * as service from './fees.service';

export const feesRouter = Router();

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  branchId: uuidSchema.optional(),
  studentId: uuidSchema.optional(),
  status: z.nativeEnum(FeeScheduleStatus).optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});

const remindersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  branchId: uuidSchema.optional(),
  status: z.nativeEnum(FeeReminderStatus).optional(),
});

feesRouter.get(
  '/',
  requirePermission(Permission.INVOICE_VIEW),
  validate({ query: listSchema }),
  asyncHandler(async (req, res) => {
    const result = await service.listFeeSchedules(getAuth(req), req.query as never);
    return res.status(200).json({
      success: true,
      data: result.data,
      meta: result.meta,
      totals: result.totals,
      message: 'Fee schedules retrieved successfully',
    });
  }),
);

feesRouter.get(
  '/reminders',
  requirePermission(Permission.FEE_MANAGE),
  validate({ query: remindersSchema }),
  asyncHandler(async (req, res) => {
    const result = await service.listReminders(getAuth(req), req.query as never);
    return paginated(res, result.data, result.meta, 'Reminders retrieved successfully');
  }),
);

/**
 * Manual trigger for the reminder run. The scheduled job calls the same
 * function, and both are idempotent, so an operator can safely re-run it.
 */
feesRouter.post(
  '/reminders/run',
  requirePermission(Permission.FEE_MANAGE),
  asyncHandler(async (_req, res) => {
    const result = await service.processFeeReminders();
    return ok(res, result, 'Fee reminder run completed');
  }),
);
