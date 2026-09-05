import { Router } from 'express';
import { Permission } from '@manas/shared';
import { asyncHandler } from '../../middleware/asyncHandler';
import { getAuth } from '../../middleware/auth';
import { idParamSchema, validate } from '../../middleware/validate';
import { requirePermission } from '../../guards/rbac';
import { created, ok, paginated } from '../../utils/response';
import * as service from './seats.service';
import {
  allocateSeatSchema,
  allocationHistorySchema,
  bulkCreateSeatsSchema,
  createSeatSchema,
  listSeatsSchema,
  releaseSeatSchema,
  transferSeatSchema,
  updateSeatSchema,
} from './seats.schema';

export const seatsRouter = Router();

seatsRouter.get(
  '/',
  validate({ query: listSeatsSchema }),
  asyncHandler(async (req, res) => {
    const seats = await service.listSeats(getAuth(req), req.query as never);
    return ok(res, seats, 'Seats retrieved successfully');
  }),
);

seatsRouter.post(
  '/',
  requirePermission(Permission.SEAT_MANAGE),
  validate({ body: createSeatSchema }),
  asyncHandler(async (req, res) => {
    const seat = await service.createSeat(getAuth(req), req.body);
    return created(res, seat, 'Seat created successfully');
  }),
);

seatsRouter.post(
  '/bulk',
  requirePermission(Permission.SEAT_MANAGE),
  validate({ body: bulkCreateSeatsSchema }),
  asyncHandler(async (req, res) => {
    const result = await service.bulkCreateSeats(getAuth(req), req.body);
    return created(
      res,
      result,
      `${result.created} seat(s) created, ${result.skipped.length} already existed`,
    );
  }),
);

seatsRouter.get(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const seat = await service.getSeat(getAuth(req), req.params.id!);
    return ok(res, seat, 'Seat retrieved successfully');
  }),
);

seatsRouter.patch(
  '/:id',
  requirePermission(Permission.SEAT_MANAGE),
  validate({ params: idParamSchema, body: updateSeatSchema }),
  asyncHandler(async (req, res) => {
    const seat = await service.updateSeat(getAuth(req), req.params.id!, req.body);
    return ok(res, seat, 'Seat updated successfully');
  }),
);

/* -------------------------------------------------------------------------
 * Allocations — mounted at /api/v1/seat-allocations
 * ---------------------------------------------------------------------- */

export const seatAllocationsRouter = Router();

seatAllocationsRouter.get(
  '/',
  validate({ query: allocationHistorySchema }),
  asyncHandler(async (req, res) => {
    const result = await service.listAllocations(getAuth(req), req.query as never);
    return paginated(res, result.data, result.meta, 'Allocations retrieved successfully');
  }),
);

seatAllocationsRouter.post(
  '/',
  requirePermission(Permission.SEAT_ALLOCATE),
  validate({ body: allocateSeatSchema }),
  asyncHandler(async (req, res) => {
    const allocation = await service.allocateSeat(getAuth(req), req.body);
    return created(res, allocation, 'Seat allocated successfully');
  }),
);

seatAllocationsRouter.post(
  '/transfer',
  requirePermission(Permission.SEAT_ALLOCATE),
  validate({ body: transferSeatSchema }),
  asyncHandler(async (req, res) => {
    const allocation = await service.transferSeat(getAuth(req), req.body);
    return created(res, allocation, 'Seat transferred successfully');
  }),
);

seatAllocationsRouter.post(
  '/release',
  requirePermission(Permission.SEAT_ALLOCATE),
  validate({ body: releaseSeatSchema }),
  asyncHandler(async (req, res) => {
    const allocation = await service.releaseSeat(getAuth(req), req.body);
    return ok(res, allocation, 'Seat released successfully');
  }),
);
