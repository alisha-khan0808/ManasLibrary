import type { NextFunction, Request, Response } from 'express';
import { z, type ZodTypeAny } from 'zod';
import { validationError } from '../utils/errors';

/**
 * Server-side validation is mandatory (PRD §39). Parsed output replaces the
 * raw input, so handlers only ever see coerced, whitelisted values — unknown
 * keys are stripped rather than passed through to SQL builders.
 */

interface Schemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

export function validate(schemas: Schemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const issues: Array<{ path: string; message: string }> = [];

    for (const source of ['params', 'query', 'body'] as const) {
      const schema = schemas[source];
      if (!schema) continue;

      const result = schema.safeParse(req[source]);

      if (!result.success) {
        for (const issue of result.error.issues) {
          issues.push({
            path: [source, ...issue.path].join('.'),
            message: issue.message,
          });
        }
        continue;
      }

      // req.query and req.params are getter-only in Express 5 and plain
      // objects in Express 4; assigning through defineProperty works for both.
      Object.defineProperty(req, source, {
        value: result.data,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    }

    if (issues.length > 0) {
      next(validationError('The request contains invalid values.', issues));
      return;
    }

    next();
  };
}

/* --------------------------------------------------------------------------
 * Reusable field schemas
 * ----------------------------------------------------------------------- */

export const uuidSchema = z.string().uuid('Must be a valid identifier.');

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a date in YYYY-MM-DD format.')
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), {
    message: 'Must be a real calendar date.',
  });

export const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Must be a time in HH:MM format.');

export const mobileSchema = z
  .string()
  .trim()
  .regex(/^[0-9]{10,15}$/, 'Must be a 10–15 digit mobile number without spaces.');

export const emailSchema = z.string().trim().toLowerCase().email('Must be a valid email address.');

export const moneySchema = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, 'Must be an amount with at most two decimal places.');

export const idParamSchema = z.object({ id: uuidSchema });

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

export const branchQuerySchema = z.object({
  branchId: uuidSchema.optional(),
});

export const dateRangeSchema = z.object({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});
