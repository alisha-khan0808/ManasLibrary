import { Router } from 'express';
import { z } from 'zod';
import { AttendanceSource, AttendanceStatus, Permission } from '@manas/shared';
import { asyncHandler } from '../../middleware/asyncHandler';
import { getAuth } from '../../middleware/auth';
import { idParamSchema, isoDateSchema, uuidSchema, validate } from '../../middleware/validate';
import { requirePermission } from '../../guards/rbac';
import { created, ok, paginated } from '../../utils/response';
import * as service from './attendance.service';

export const attendanceRouter = Router();

const markSchema = z.object({
  branch_id: uuidSchema.optional(),
  student_id: uuidSchema,
  batch_id: uuidSchema.optional().nullable(),
  attendance_date: isoDateSchema.optional(),
  check_in_time: z.string().datetime({ offset: true }).optional().nullable(),
  check_out_time: z.string().datetime({ offset: true }).optional().nullable(),
  status: z.nativeEnum(AttendanceStatus).optional(),
  notes: z.string().trim().max(300).optional().nullable(),
});

const markBatchSchema = z.object({
  branch_id: uuidSchema.optional(),
  batch_id: uuidSchema,
  attendance_date: isoDateSchema.optional(),
  student_ids: z.array(uuidSchema).min(1).max(500),
});

const correctSchema = z.object({
  check_in_time: z.string().datetime({ offset: true }).optional().nullable(),
  check_out_time: z.string().datetime({ offset: true }).optional().nullable(),
  status: z.nativeEnum(AttendanceStatus).optional(),
  notes: z.string().trim().max(300).optional().nullable(),
});

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  branchId: uuidSchema.optional(),
  studentId: uuidSchema.optional(),
  batchId: uuidSchema.optional(),
  date: isoDateSchema.optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  status: z.nativeEnum(AttendanceStatus).optional(),
  source: z.nativeEnum(AttendanceSource).optional(),
});

const rosterSchema = z.object({
  branchId: uuidSchema.optional(),
  batchId: uuidSchema.optional(),
  date: isoDateSchema.optional(),
});

const summarySchema = z.object({
  branchId: uuidSchema.optional(),
  from: isoDateSchema,
  to: isoDateSchema,
});

attendanceRouter.get(
  '/',
  requirePermission(Permission.ATTENDANCE_MANAGE),
  validate({ query: listSchema }),
  asyncHandler(async (req, res) => {
    const result = await service.listAttendance(getAuth(req), req.query as never);
    return paginated(res, result.data, result.meta, 'Attendance retrieved successfully');
  }),
);

attendanceRouter.get(
  '/roster',
  requirePermission(Permission.ATTENDANCE_MANAGE),
  validate({ query: rosterSchema }),
  asyncHandler(async (req, res) => {
    const roster = await service.dailyRoster(getAuth(req), req.query as never);
    return ok(res, roster, 'Daily roster retrieved successfully');
  }),
);

attendanceRouter.get(
  '/summary',
  requirePermission(Permission.ATTENDANCE_MANAGE),
  validate({ query: summarySchema }),
  asyncHandler(async (req, res) => {
    const summary = await service.attendanceSummary(getAuth(req), req.query as never);
    return ok(res, summary, 'Attendance summary retrieved successfully');
  }),
);

attendanceRouter.post(
  '/',
  requirePermission(Permission.ATTENDANCE_MANAGE),
  validate({ body: markSchema }),
  asyncHandler(async (req, res) => {
    const attendance = await service.markAttendance(getAuth(req), req.body);
    return created(res, attendance, 'Attendance recorded successfully');
  }),
);

attendanceRouter.post(
  '/batch',
  requirePermission(Permission.ATTENDANCE_MANAGE),
  validate({ body: markBatchSchema }),
  asyncHandler(async (req, res) => {
    const result = await service.markBatchAttendance(getAuth(req), req.body);
    return created(
      res,
      result,
      `${result.created} student(s) marked present, ${result.skipped} already recorded`,
    );
  }),
);

attendanceRouter.patch(
  '/:id',
  requirePermission(Permission.ATTENDANCE_MANAGE),
  validate({ params: idParamSchema, body: correctSchema }),
  asyncHandler(async (req, res) => {
    const attendance = await service.correctAttendance(
      getAuth(req),
      req.params.id!,
      req.body,
    );
    return ok(res, attendance, 'Attendance corrected successfully');
  }),
);
