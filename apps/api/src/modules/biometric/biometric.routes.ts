import { Router } from 'express';
import { z } from 'zod';
import { DeviceStatus, Permission } from '@manas/shared';
import { asyncHandler } from '../../middleware/asyncHandler';
import { getAuth } from '../../middleware/auth';
import { idParamSchema, uuidSchema, validate } from '../../middleware/validate';
import { requirePermission } from '../../guards/rbac';
import { created, noContent, ok } from '../../utils/response';
import * as service from './biometric.service';

export const biometricRouter = Router();

const createDeviceSchema = z.object({
  branch_id: uuidSchema.optional(),
  name: z.string().trim().min(2).max(80),
  device_identifier: z.string().trim().min(1).max(80),
  ip_address: z.string().trim().ip().optional().nullable(),
  api_endpoint: z.string().url().max(300).optional().nullable(),
});

const updateDeviceSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  ip_address: z.string().trim().ip().optional().nullable(),
  api_endpoint: z.string().url().max(300).optional().nullable(),
  status: z.nativeEnum(DeviceStatus).optional(),
});

const createMappingSchema = z.object({
  branch_id: uuidSchema.optional(),
  device_id: uuidSchema,
  biometric_user_id: z.string().trim().min(1).max(60),
  student_id: uuidSchema,
});

const syncSchema = z.object({
  /** How far back to pull. Defaults to a day, which comfortably covers a
   *  missed 15-minute run without re-reading the whole device log. */
  hours: z.coerce.number().int().min(1).max(168).default(24),
});

biometricRouter.get(
  '/devices',
  requirePermission(Permission.BIOMETRIC_MANAGE),
  validate({ query: z.object({ branchId: uuidSchema.optional() }) }),
  asyncHandler(async (req, res) => {
    const devices = await service.listDevices(getAuth(req), req.query as never);
    return ok(res, devices, 'Devices retrieved successfully');
  }),
);

biometricRouter.post(
  '/devices',
  requirePermission(Permission.BIOMETRIC_MANAGE),
  validate({ body: createDeviceSchema }),
  asyncHandler(async (req, res) => {
    const device = await service.createDevice(getAuth(req), req.body);
    return created(res, device, 'Device registered successfully');
  }),
);

biometricRouter.patch(
  '/devices/:id',
  requirePermission(Permission.BIOMETRIC_MANAGE),
  validate({ params: idParamSchema, body: updateDeviceSchema }),
  asyncHandler(async (req, res) => {
    const device = await service.updateDevice(getAuth(req), req.params.id!, req.body);
    return ok(res, device, 'Device updated successfully');
  }),
);

biometricRouter.post(
  '/devices/:id/test',
  requirePermission(Permission.BIOMETRIC_MANAGE),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const report = await service.testDevice(getAuth(req), req.params.id!);
    return ok(res, report, report.reachable ? 'Device is reachable' : 'Device is not reachable');
  }),
);

biometricRouter.post(
  '/devices/:id/sync',
  requirePermission(Permission.BIOMETRIC_MANAGE),
  validate({ params: idParamSchema, body: syncSchema }),
  asyncHandler(async (req, res) => {
    const until = new Date();
    const since = new Date(until.getTime() - req.body.hours * 3_600_000);

    const result = await service.syncDevice(getAuth(req), req.params.id!, { since, until });

    return ok(
      res,
      result,
      result.error
        ? `Sync failed: ${result.error}`
        : `Sync complete: ${result.attendanceCreated} created, ${result.attendanceUpdated} updated, ${result.unmapped} unmapped`,
    );
  }),
);

biometricRouter.get(
  '/mappings',
  requirePermission(Permission.BIOMETRIC_MANAGE),
  validate({
    query: z.object({ branchId: uuidSchema.optional(), deviceId: uuidSchema.optional() }),
  }),
  asyncHandler(async (req, res) => {
    const mappings = await service.listMappings(getAuth(req), req.query as never);
    return ok(res, mappings, 'Mappings retrieved successfully');
  }),
);

biometricRouter.post(
  '/mappings',
  requirePermission(Permission.BIOMETRIC_MANAGE),
  validate({ body: createMappingSchema }),
  asyncHandler(async (req, res) => {
    const mapping = await service.createMapping(getAuth(req), req.body);
    return created(res, mapping, 'Biometric user mapped successfully');
  }),
);

biometricRouter.delete(
  '/mappings/:id',
  requirePermission(Permission.BIOMETRIC_MANAGE),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    await service.deleteMapping(getAuth(req), req.params.id!);
    return noContent(res);
  }),
);

biometricRouter.get(
  '/unmapped',
  requirePermission(Permission.BIOMETRIC_MANAGE),
  validate({ query: z.object({ branchId: uuidSchema.optional() }) }),
  asyncHandler(async (req, res) => {
    const events = await service.unmappedEvents(getAuth(req), req.query as never);
    return ok(res, events, 'Unmapped biometric users retrieved successfully');
  }),
);
