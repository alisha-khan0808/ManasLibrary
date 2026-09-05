import { Router } from 'express';
import { Permission } from '@manas/shared';
import { asyncHandler } from '../../middleware/asyncHandler';
import { getAuth } from '../../middleware/auth';
import { idParamSchema, validate } from '../../middleware/validate';
import { requirePermission } from '../../guards/rbac';
import { created, ok, paginated } from '../../utils/response';
import * as service from './students.service';
import {
  createStudentSchema,
  listStudentsSchema,
  updateStudentSchema,
} from './students.schema';

export const studentsRouter = Router();

studentsRouter.get(
  '/',
  requirePermission(Permission.STUDENT_VIEW),
  validate({ query: listStudentsSchema }),
  asyncHandler(async (req, res) => {
    const result = await service.listStudents(getAuth(req), req.query as never);
    return paginated(res, result.data, result.meta, 'Students retrieved successfully');
  }),
);

studentsRouter.post(
  '/',
  requirePermission(Permission.STUDENT_MANAGE),
  validate({ body: createStudentSchema }),
  asyncHandler(async (req, res) => {
    const student = await service.createStudent(getAuth(req), req.body);
    return created(res, student, 'Student created successfully');
  }),
);

studentsRouter.get(
  '/:id',
  requirePermission(Permission.STUDENT_VIEW),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const student = await service.getStudent(getAuth(req), req.params.id!);
    return ok(res, student, 'Student retrieved successfully');
  }),
);

studentsRouter.get(
  '/:id/profile',
  requirePermission(Permission.STUDENT_VIEW),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const profile = await service.getStudentProfile(getAuth(req), req.params.id!);
    return ok(res, profile, 'Student profile retrieved successfully');
  }),
);

studentsRouter.patch(
  '/:id',
  requirePermission(Permission.STUDENT_MANAGE),
  validate({ params: idParamSchema, body: updateStudentSchema }),
  asyncHandler(async (req, res) => {
    const student = await service.updateStudent(getAuth(req), req.params.id!, req.body);
    return ok(res, student, 'Student updated successfully');
  }),
);
