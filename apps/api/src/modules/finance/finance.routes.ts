import { Router } from 'express';
import { z } from 'zod';
import { InvoiceStatus, PaymentMethod, Permission } from '@manas/shared';
import { asyncHandler } from '../../middleware/asyncHandler';
import { getAuth } from '../../middleware/auth';
import {
  idParamSchema,
  isoDateSchema,
  moneySchema,
  uuidSchema,
  validate,
} from '../../middleware/validate';
import { requirePermission } from '../../guards/rbac';
import { requireBranchForWrite } from '../../guards/branch';
import { created, ok, paginated } from '../../utils/response';
import * as invoices from './invoices.service';
import * as payments from './payments.service';

/* -------------------------------------------------------------------------
 * Invoices
 * ---------------------------------------------------------------------- */

export const invoicesRouter = Router();

const invoiceLineSchema = z.object({
  description: z.string().trim().min(1).max(200),
  quantity: z.coerce.number().int().min(1).max(1000).default(1),
  unit_price: moneySchema,
});

const createInvoiceSchema = z.object({
  branch_id: uuidSchema.optional(),
  student_id: uuidSchema,
  admission_id: uuidSchema.optional().nullable(),
  invoice_date: isoDateSchema.optional(),
  due_date: isoDateSchema,
  discount: moneySchema.default('0.00'),
  tax: moneySchema.default('0.00'),
  notes: z.string().trim().max(500).optional().nullable(),
  lines: z.array(invoiceLineSchema).min(1).max(50),
});

const listInvoicesSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  branchId: uuidSchema.optional(),
  studentId: uuidSchema.optional(),
  status: z.nativeEnum(InvoiceStatus).optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  search: z.string().trim().max(120).optional(),
});

invoicesRouter.get(
  '/',
  requirePermission(Permission.INVOICE_VIEW),
  validate({ query: listInvoicesSchema }),
  asyncHandler(async (req, res) => {
    const result = await invoices.listInvoices(getAuth(req), req.query as never);
    return paginated(res, result.data, result.meta, 'Invoices retrieved successfully');
  }),
);

invoicesRouter.post(
  '/',
  requirePermission(Permission.INVOICE_MANAGE),
  validate({ body: createInvoiceSchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(req);
    const body = req.body as z.infer<typeof createInvoiceSchema>;
    const branchId = requireBranchForWrite(auth, body.branch_id);

    const invoice = await invoices.createInvoice(auth, {
      branchId,
      studentId: body.student_id,
      admissionId: body.admission_id ?? null,
      invoiceDate: body.invoice_date,
      dueDate: body.due_date,
      discount: body.discount,
      tax: body.tax,
      notes: body.notes ?? null,
      lines: body.lines,
    });

    return created(res, invoice, 'Invoice created successfully');
  }),
);

invoicesRouter.get(
  '/:id',
  requirePermission(Permission.INVOICE_VIEW),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const result = await invoices.getInvoice(getAuth(req), req.params.id!);
    return ok(res, result, 'Invoice retrieved successfully');
  }),
);

invoicesRouter.post(
  '/:id/cancel',
  requirePermission(Permission.INVOICE_MANAGE),
  validate({
    params: idParamSchema,
    body: z.object({ reason: z.string().trim().min(3).max(300) }),
  }),
  asyncHandler(async (req, res) => {
    const invoice = await invoices.cancelInvoice(
      getAuth(req),
      req.params.id!,
      req.body.reason,
    );
    return ok(res, invoice, 'Invoice cancelled successfully');
  }),
);

/* -------------------------------------------------------------------------
 * Payments
 * ---------------------------------------------------------------------- */

export const paymentsRouter = Router();

const recordPaymentSchema = z.object({
  branch_id: uuidSchema.optional(),
  invoice_id: uuidSchema,
  amount: moneySchema,
  payment_method: z.nativeEnum(PaymentMethod),
  transaction_reference: z.string().trim().max(120).optional().nullable(),
  payment_date: isoDateSchema.optional(),
  notes: z.string().trim().max(500).optional().nullable(),
});

const listPaymentsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  branchId: uuidSchema.optional(),
  studentId: uuidSchema.optional(),
  invoiceId: uuidSchema.optional(),
  method: z.nativeEnum(PaymentMethod).optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});

paymentsRouter.get(
  '/',
  requirePermission(Permission.INVOICE_VIEW),
  validate({ query: listPaymentsSchema }),
  asyncHandler(async (req, res) => {
    const result = await payments.listPayments(getAuth(req), req.query as never);
    return res.status(200).json({
      success: true,
      data: result.data,
      meta: result.meta,
      totals: result.totals,
      message: 'Payments retrieved successfully',
    });
  }),
);

paymentsRouter.post(
  '/',
  requirePermission(Permission.PAYMENT_RECORD),
  validate({ body: recordPaymentSchema }),
  asyncHandler(async (req, res) => {
    const result = await payments.recordPayment(getAuth(req), req.body);
    return created(res, result, 'Payment recorded successfully');
  }),
);

paymentsRouter.get(
  '/:id',
  requirePermission(Permission.INVOICE_VIEW),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const payment = await payments.getPayment(getAuth(req), req.params.id!);
    return ok(res, payment, 'Payment retrieved successfully');
  }),
);

paymentsRouter.post(
  '/:id/reverse',
  requirePermission(Permission.PAYMENT_REVERSE),
  validate({
    params: idParamSchema,
    body: z.object({ reason: z.string().trim().min(3).max(300) }),
  }),
  asyncHandler(async (req, res) => {
    const result = await payments.reversePayment(
      getAuth(req),
      req.params.id!,
      req.body.reason,
    );
    return created(res, result, 'Payment reversed successfully');
  }),
);
