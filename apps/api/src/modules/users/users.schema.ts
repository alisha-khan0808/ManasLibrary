import { z } from 'zod';
import { UserRole, UserStatus } from '@manas/shared';
import { emailSchema, uuidSchema } from '../../middleware/validate';

export const createUserSchema = z
  .object({
    email: emailSchema,
    full_name: z.string().trim().min(2).max(120),
    phone: z
      .string()
      .trim()
      .regex(/^[0-9+\-\s()]{6,20}$/, 'Must be a valid phone number.')
      .optional()
      .nullable(),
    role: z.nativeEnum(UserRole),
    branch_ids: z.array(uuidSchema).max(50).default([]),
    primary_branch_id: uuidSchema.optional().nullable(),
  })
  .superRefine((value, ctx) => {
    // A non-super-admin without a branch could log in and see nothing; reject
    // that at the edge rather than creating an unusable account.
    if (value.role !== UserRole.SUPER_ADMIN && value.branch_ids.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['branch_ids'],
        message: 'Assign at least one branch to a Branch Admin or Staff account.',
      });
    }
    if (
      value.primary_branch_id &&
      !value.branch_ids.includes(value.primary_branch_id)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['primary_branch_id'],
        message: 'The primary branch must be one of the assigned branches.',
      });
    }
  });

export const updateUserSchema = z.object({
  full_name: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().max(20).optional().nullable(),
  role: z.nativeEnum(UserRole).optional(),
  status: z.nativeEnum(UserStatus).optional(),
  branch_ids: z.array(uuidSchema).max(50).optional(),
  primary_branch_id: uuidSchema.optional().nullable(),
});

export const listUsersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
  role: z.nativeEnum(UserRole).optional(),
  status: z.nativeEnum(UserStatus).optional(),
  branchId: uuidSchema.optional(),
});

export const passwordResetSchema = z.object({
  email: emailSchema,
  redirectTo: z.string().url().optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
