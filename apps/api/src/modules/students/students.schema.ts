import { z } from 'zod';
import { StudentStatus } from '@manas/shared';
import {
  emailSchema,
  isoDateSchema,
  mobileSchema,
  uuidSchema,
} from '../../middleware/validate';

export const createStudentSchema = z.object({
  branch_id: uuidSchema.optional(),
  full_name: z.string().trim().min(2).max(120),
  mobile: mobileSchema,
  email: emailSchema.optional().nullable(),
  date_of_birth: isoDateSchema.optional().nullable(),
  address: z.string().trim().max(400).optional().nullable(),
  emergency_contact_name: z.string().trim().max(120).optional().nullable(),
  emergency_contact_phone: z
    .string()
    .trim()
    .regex(/^[0-9]{10,15}$/, 'Must be a 10–15 digit phone number.')
    .optional()
    .nullable(),
  photo_url: z.string().url().max(500).optional().nullable(),
});

export const updateStudentSchema = createStudentSchema
  .omit({ branch_id: true })
  .partial()
  .extend({
    status: z.nativeEnum(StudentStatus).optional(),
  });

export const listStudentsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
  branchId: uuidSchema.optional(),
  status: z.nativeEnum(StudentStatus).optional(),
  batchId: uuidSchema.optional(),
  sortBy: z.enum(['full_name', 'created_at', 'student_code']).default('created_at'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

export type CreateStudentInput = z.infer<typeof createStudentSchema>;
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;
