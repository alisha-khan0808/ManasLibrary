import { z } from 'zod';
import { AdmissionStatus, PaymentMethod } from '@manas/shared';
import {
  emailSchema,
  isoDateSchema,
  mobileSchema,
  moneySchema,
  uuidSchema,
} from '../../middleware/validate';

const newStudentSchema = z.object({
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

const openingPaymentSchema = z.object({
  amount: moneySchema,
  payment_method: z.nativeEnum(PaymentMethod),
  transaction_reference: z.string().trim().max(120).optional().nullable(),
  payment_date: isoDateSchema.optional(),
  notes: z.string().trim().max(300).optional().nullable(),
});

export const createAdmissionSchema = z
  .object({
    branch_id: uuidSchema.optional(),
    student_id: uuidSchema.optional(),
    student: newStudentSchema.optional(),
    membership_plan_id: uuidSchema,
    batch_id: uuidSchema.optional().nullable(),
    seat_id: uuidSchema.optional().nullable(),
    admission_date: isoDateSchema.optional(),
    start_date: isoDateSchema,
    due_date: isoDateSchema.optional(),
    discount: moneySchema.default('0.00'),
    notes: z.string().trim().max(500).optional().nullable(),
    payment: openingPaymentSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.student_id && !value.student) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['student_id'],
        message: 'Provide either student_id or new student details.',
      });
    }
    if (value.student_id && value.student) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['student'],
        message: 'Provide either student_id or student details, not both.',
      });
    }
  });

export const quoteAdmissionSchema = z.object({
  branch_id: uuidSchema.optional(),
  membership_plan_id: uuidSchema,
  start_date: isoDateSchema,
  discount: moneySchema.optional(),
});

export const listAdmissionsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  branchId: uuidSchema.optional(),
  studentId: uuidSchema.optional(),
  status: z.nativeEnum(AdmissionStatus).optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  search: z.string().trim().max(120).optional(),
});

export const renewalsSchema = z.object({
  branchId: uuidSchema.optional(),
  days: z.coerce.number().int().min(1).max(120).default(15),
});

export type CreateAdmissionInput = z.infer<typeof createAdmissionSchema>;
