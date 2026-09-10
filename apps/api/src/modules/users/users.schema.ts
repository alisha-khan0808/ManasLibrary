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
    /**
     * Optional initial password. When omitted the account is created without
     * one and the user sets their own through a reset link, which remains the
     * better default — nobody but the account holder ever knows the secret.
     *
     * Supplying one is for the case where an administrator is onboarding
     * someone in person and a mail round-trip is impractical.
     */
    password: z
      .string()
      .min(8, 'Use at least 8 characters.')
      .max(72, 'Use at most 72 characters.')
      .optional(),
  })
  .superRefine((value, ctx) => {
    // Reject a password that is only the obvious thing. This is a floor, not
    // a policy — the real protection is that the holder can change it.
    if (value.password && /^(password|manas|admin|12345678|qwerty)/i.test(value.password)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['password'],
        message: 'Choose something less guessable.',
      });
    }
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
