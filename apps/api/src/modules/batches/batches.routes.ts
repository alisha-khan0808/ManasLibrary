import { Router } from 'express';
import { z } from 'zod';
import { BatchStatus, Permission } from '@manas/shared';
import { asyncHandler } from '../../middleware/asyncHandler';
import { getAuth } from '../../middleware/auth';
import {
  idParamSchema,
  isoDateSchema,
  timeSchema,
  uuidSchema,
  validate,
} from '../../middleware/validate';
import { requirePermission } from '../../guards/rbac';
import { created, ok } from '../../utils/response';
import * as service from './batches.service';

export const batchesRouter = Router();

const createBatchSchema = z
  .object({
    branch_id: uuidSchema.optional(),
    name: z.string().trim().min(2).max(60),
    start_time: timeSchema,
    end_time: timeSchema,
    capacity: z.coerce.number().int().min(1).max(10_000),
    status: z.nativeEnum(BatchStatus).default(BatchStatus.ACTIVE),
  })
  .refine((value) => value.end_time > value.start_time, {
    path: ['end_time'],
    message: 'End time must be after start time.',
  });

const updateBatchSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  start_time: timeSchema.optional(),
  end_time: timeSchema.optional(),
  capacity: z.coerce.number().int().min(1).max(10_000).optional(),
  status: z.nativeEnum(BatchStatus).optional(),
});

const listBatchesSchema = z.object({
  branchId: uuidSchema.optional(),
  status: z.nativeEnum(BatchStatus).optional(),
});

const enrollSchema = z.object({
  branch_id: uuidSchema.optional(),
  batch_id: uuidSchema,
  student_id: uuidSchema,
  start_date: isoDateSchema,
  end_date: isoDateSchema.optional().nullable(),
});

const transferSchema = z.object({
  enrollment_id: uuidSchema,
  new_batch_id: uuidSchema,
  effective_date: isoDateSchema,
});

batchesRouter.get(
  '/',
  validate({ query: listBatchesSchema }),
  asyncHandler(async (req, res) => {
    const batches = await service.listBatches(getAuth(req), req.query as never);
    return ok(res, batches, 'Batches retrieved successfully');
  }),
);

batchesRouter.post(
  '/',
  requirePermission(Permission.BATCH_MANAGE),
  validate({ body: createBatchSchema }),
  asyncHandler(async (req, res) => {
    const batch = await service.createBatch(getAuth(req), req.body);
    return created(res, batch, 'Batch created successfully');
  }),
);

batchesRouter.post(
  '/enroll',
  requirePermission(Permission.BATCH_MANAGE),
  validate({ body: enrollSchema }),
  asyncHandler(async (req, res) => {
    const enrollment = await service.enroll(getAuth(req), req.body);
    return created(res, enrollment, 'Student enrolled successfully');
  }),
);

batchesRouter.post(
  '/transfer',
  requirePermission(Permission.BATCH_MANAGE),
  validate({ body: transferSchema }),
  asyncHandler(async (req, res) => {
    const enrollment = await service.transferBatch(getAuth(req), req.body);
    return created(res, enrollment, 'Student transferred successfully');
  }),
);

batchesRouter.post(
  '/enrollments/:id/unenroll',
  requirePermission(Permission.BATCH_MANAGE),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const enrollment = await service.unenroll(getAuth(req), req.params.id!);
    return ok(res, enrollment, 'Student removed from batch');
  }),
);

batchesRouter.get(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const batch = await service.getBatch(getAuth(req), req.params.id!);
    return ok(res, batch, 'Batch retrieved successfully');
  }),
);

batchesRouter.get(
  '/:id/students',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const students = await service.listBatchStudents(getAuth(req), req.params.id!);
    return ok(res, students, 'Batch students retrieved successfully');
  }),
);

batchesRouter.patch(
  '/:id',
  requirePermission(Permission.BATCH_MANAGE),
  validate({ params: idParamSchema, body: updateBatchSchema }),
  asyncHandler(async (req, res) => {
    const batch = await service.updateBatch(getAuth(req), req.params.id!, req.body);
    return ok(res, batch, 'Batch updated successfully');
  }),
);
