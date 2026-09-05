import { z } from 'zod';
import { SeatStatus, SeatType } from '@manas/shared';
import { isoDateSchema, uuidSchema } from '../../middleware/validate';

export const createSeatSchema = z.object({
  branch_id: uuidSchema.optional(),
  seat_number: z.string().trim().min(1).max(20),
  floor: z.string().trim().max(30).optional().nullable(),
  section: z.string().trim().max(30).optional().nullable(),
  seat_type: z.nativeEnum(SeatType).default(SeatType.STANDARD),
  status: z.nativeEnum(SeatStatus).default(SeatStatus.AVAILABLE),
});

/**
 * Bulk creation for setting up a new branch: "A01".."A40" in one call rather
 * than forty round trips.
 */
export const bulkCreateSeatsSchema = z.object({
  branch_id: uuidSchema.optional(),
  prefix: z.string().trim().min(1).max(10),
  from: z.coerce.number().int().min(1).max(9999),
  to: z.coerce.number().int().min(1).max(9999),
  padding: z.coerce.number().int().min(1).max(4).default(2),
  floor: z.string().trim().max(30).optional().nullable(),
  section: z.string().trim().max(30).optional().nullable(),
  seat_type: z.nativeEnum(SeatType).default(SeatType.STANDARD),
});

export const updateSeatSchema = z.object({
  seat_number: z.string().trim().min(1).max(20).optional(),
  floor: z.string().trim().max(30).optional().nullable(),
  section: z.string().trim().max(30).optional().nullable(),
  seat_type: z.nativeEnum(SeatType).optional(),
  status: z.nativeEnum(SeatStatus).optional(),
});

export const listSeatsSchema = z.object({
  branchId: uuidSchema.optional(),
  status: z.nativeEnum(SeatStatus).optional(),
  floor: z.string().trim().max(30).optional(),
  section: z.string().trim().max(30).optional(),
  seatType: z.nativeEnum(SeatType).optional(),
  availableOn: isoDateSchema.optional(),
});

export const allocateSeatSchema = z.object({
  branch_id: uuidSchema.optional(),
  seat_id: uuidSchema,
  student_id: uuidSchema,
  start_date: isoDateSchema,
  end_date: isoDateSchema.optional().nullable(),
  notes: z.string().trim().max(300).optional().nullable(),
});

export const transferSeatSchema = z.object({
  allocation_id: uuidSchema,
  new_seat_id: uuidSchema,
  effective_date: isoDateSchema,
  notes: z.string().trim().max(300).optional().nullable(),
});

export const releaseSeatSchema = z.object({
  allocation_id: uuidSchema,
  release_date: isoDateSchema.optional(),
  notes: z.string().trim().max(300).optional().nullable(),
});

export const allocationHistorySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  branchId: uuidSchema.optional(),
  seatId: uuidSchema.optional(),
  studentId: uuidSchema.optional(),
});

export type AllocateSeatInput = z.infer<typeof allocateSeatSchema>;
export type TransferSeatInput = z.infer<typeof transferSeatSchema>;
export type ReleaseSeatInput = z.infer<typeof releaseSeatSchema>;
