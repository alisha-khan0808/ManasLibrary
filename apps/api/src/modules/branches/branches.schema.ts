import { z } from 'zod';
import { BranchStatus } from '@manas/shared';
import { emailSchema, timeSchema } from '../../middleware/validate';

export const createBranchSchema = z.object({
  branch_code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{2,20}$/, 'Use 2–20 letters, digits, hyphen or underscore.'),
  name: z.string().trim().min(2).max(120),
  address: z.string().trim().max(400).optional().nullable(),
  city: z.string().trim().max(80).optional().nullable(),
  state: z.string().trim().max(80).optional().nullable(),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\-\s()]{6,20}$/, 'Must be a valid phone number.')
    .optional()
    .nullable(),
  email: emailSchema.optional().nullable(),
  opening_time: timeSchema.optional().nullable(),
  closing_time: timeSchema.optional().nullable(),
  status: z.nativeEnum(BranchStatus).default(BranchStatus.ACTIVE),
});

export const updateBranchSchema = createBranchSchema.partial().omit({ branch_code: true });

export const branchStatusSchema = z.object({
  status: z.nativeEnum(BranchStatus),
});

export const listBranchesSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().trim().max(120).optional(),
  status: z.nativeEnum(BranchStatus).optional(),
});

export type CreateBranchInput = z.infer<typeof createBranchSchema>;
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>;
