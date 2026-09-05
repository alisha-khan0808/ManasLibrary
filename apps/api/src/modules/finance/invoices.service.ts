import {
  AuditAction,
  ErrorCode,
  FeeScheduleStatus,
  InvoiceStatus,
  type AuthContext,
  type Invoice,
  type InvoiceItem,
} from '@manas/shared';
import { query, queryOne } from '../../database/pool';
import { withTransaction, type Tx } from '../../database/transaction';
import {
  assertBranchAccess,
  branchPredicate,
  resolveBranchScope,
} from '../../guards/branch';
import { recordAudit } from '../../services/audit';
import { AppError, conflict, notFound } from '../../utils/errors';
import { buildPaginationMeta } from '../../utils/response';
import { calculateInvoiceTotals, deriveInvoiceStatus, InvoiceRuleError } from '../../domain/invoice';
import { compareMoney, normalizeMoney } from '../../domain/money';
import { today } from '../../domain/dates';

/** Invoice column list, parameterised by table alias. */
export function invoiceColumns(alias = ''): string {
  const p = alias ? `${alias}.` : '';
  return `${p}id, ${p}invoice_number::text AS invoice_number, ${p}branch_id,
          ${p}student_id, ${p}admission_id, ${p}invoice_date, ${p}due_date,
          ${p}subtotal::text AS subtotal, ${p}discount::text AS discount,
          ${p}tax::text AS tax, ${p}total::text AS total,
          ${p}amount_paid::text AS amount_paid, ${p}balance::text AS balance,
          ${p}status, ${p}notes, ${p}created_at, ${p}updated_at`;
}

export interface InvoiceLineInput {
  description: string;
  quantity: number;
  unit_price: string;
}

export interface CreateInvoiceParams {
  branchId: string;
  studentId: string;
  admissionId?: string | null;
  invoiceDate?: string;
  dueDate: string;
  discount?: string;
  tax?: string;
  notes?: string | null;
  lines: InvoiceLineInput[];
}

/** Domain rule violations become API errors at this boundary. */
function toAppError(error: unknown): never {
  if (error instanceof InvoiceRuleError) {
    const status =
      error.code === 'OVERPAYMENT_NOT_ALLOWED' || error.code === 'VALIDATION_ERROR' ? 400 : 409;
    throw new AppError(status, error.code, error.message);
  }
  throw error;
}

/**
 * Creates an invoice with its line items inside an existing transaction.
 *
 * Amounts are recomputed here from the line items; anything the client sent as
 * a total is ignored (PRD §39, §40.1).
 */
export async function createInvoiceInTransaction(
  tx: Tx,
  auth: AuthContext,
  params: CreateInvoiceParams,
): Promise<Invoice> {
  let totals;
  try {
    totals = calculateInvoiceTotals(
      params.lines.map((line) => ({
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unit_price,
      })),
      normalizeMoney(params.discount ?? '0'),
      normalizeMoney(params.tax ?? '0'),
    );
  } catch (error) {
    toAppError(error);
  }

  const invoiceDate = params.invoiceDate ?? today();

  const numberRow = await tx.queryOne<{ code: string }>(
    `SELECT public.next_document_number($1, 'INVOICE', 'INV') AS code`,
    [params.branchId],
  );

  const status = deriveInvoiceStatus({
    total: totals.total,
    amountPaid: '0.00',
    dueDate: params.dueDate,
    today: invoiceDate,
  });

  const invoice = await tx.queryOne<Invoice>(
    `INSERT INTO public.invoices
       (invoice_number, branch_id, student_id, admission_id, invoice_date, due_date,
        subtotal, discount, tax, status, notes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::invoice_status, $11, $12)
     RETURNING ${INVOICE_RETURNING}`,
    [
      numberRow!.code,
      params.branchId,
      params.studentId,
      params.admissionId ?? null,
      invoiceDate,
      params.dueDate,
      totals.subtotal,
      totals.discount,
      totals.tax,
      status,
      params.notes ?? null,
      auth.userId,
    ],
  );

  for (const line of params.lines) {
    await tx.query(
      `INSERT INTO public.invoice_items (invoice_id, description, quantity, unit_price)
       VALUES ($1, $2, $3, $4)`,
      [invoice!.id, line.description, line.quantity, normalizeMoney(line.unit_price)],
    );
  }

  // The fee schedule mirrors the invoice so fees stay trackable independently
  // (PRD §20) and the reminder job has a single table to scan.
  await tx.query(
    `INSERT INTO public.fee_schedules (branch_id, student_id, invoice_id, amount, due_date, status)
     VALUES ($1, $2, $3, $4, $5, $6::fee_schedule_status)
     ON CONFLICT (invoice_id) WHERE invoice_id IS NOT NULL DO NOTHING`,
    [
      params.branchId,
      params.studentId,
      invoice!.id,
      totals.total,
      params.dueDate,
      params.dueDate <= invoiceDate ? FeeScheduleStatus.DUE : FeeScheduleStatus.UPCOMING,
    ],
  );

  await recordAudit(tx, {
    branchId: params.branchId,
    userId: auth.userId,
    action: AuditAction.INVOICE_CREATED,
    entityType: 'invoice',
    entityId: invoice!.id,
    metadata: { invoice_number: invoice!.invoice_number, total: totals.total },
  });

  return invoice!;
}

const INVOICE_COLUMNS = invoiceColumns('i');
const INVOICE_RETURNING = invoiceColumns();

export async function createInvoice(
  auth: AuthContext,
  params: CreateInvoiceParams,
): Promise<Invoice> {
  assertBranchAccess(auth, params.branchId);

  return withTransaction(async (tx) => {
    const student = await tx.queryOne<{ branch_id: string }>(
      'SELECT branch_id FROM public.students WHERE id = $1',
      [params.studentId],
    );

    if (!student) throw notFound('Student');
    if (student.branch_id !== params.branchId) {
      throw new AppError(
        403,
        ErrorCode.BRANCH_ACCESS_DENIED,
        'The student belongs to a different branch.',
      );
    }

    return createInvoiceInTransaction(tx, auth, params);
  });
}

export async function listInvoices(
  auth: AuthContext,
  params: {
    page: number;
    pageSize: number;
    branchId?: string;
    studentId?: string;
    status?: string;
    from?: string;
    to?: string;
    search?: string;
  },
) {
  const { allowedBranchIds } = resolveBranchScope(auth, params.branchId);

  const conditions: string[] = [];
  const values: unknown[] = [];
  let index = 1;

  const scope = branchPredicate(allowedBranchIds, 'i.branch_id', index);
  conditions.push(scope.sql);
  values.push(...scope.params);
  index = scope.nextIndex;

  if (params.branchId) {
    conditions.push(`i.branch_id = $${index}`);
    values.push(params.branchId);
    index += 1;
  }
  if (params.studentId) {
    conditions.push(`i.student_id = $${index}`);
    values.push(params.studentId);
    index += 1;
  }
  if (params.status) {
    conditions.push(`i.status = $${index}::invoice_status`);
    values.push(params.status);
    index += 1;
  }
  if (params.from) {
    conditions.push(`i.invoice_date >= $${index}`);
    values.push(params.from);
    index += 1;
  }
  if (params.to) {
    conditions.push(`i.invoice_date <= $${index}`);
    values.push(params.to);
    index += 1;
  }
  if (params.search) {
    conditions.push(`(i.invoice_number::text ILIKE $${index} OR s.full_name ILIKE $${index})`);
    values.push(`%${params.search}%`);
    index += 1;
  }

  const where = `WHERE ${conditions.join(' AND ')}`;
  const offset = (params.page - 1) * params.pageSize;

  const rows = await query(
    `SELECT ${INVOICE_COLUMNS},
            s.full_name AS student_name,
            s.student_code::text AS student_code
       FROM public.invoices i
       JOIN public.students s ON s.id = i.student_id
       ${where}
      ORDER BY i.invoice_date DESC, i.created_at DESC
      LIMIT $${index} OFFSET $${index + 1}`,
    [...values, params.pageSize, offset],
  );

  const countRow = await queryOne<{ count: number }>(
    `SELECT count(*)::bigint AS count
       FROM public.invoices i
       JOIN public.students s ON s.id = i.student_id
       ${where}`,
    values,
  );

  return {
    data: rows,
    meta: buildPaginationMeta(params.page, params.pageSize, countRow?.count ?? 0),
  };
}

export async function getInvoice(auth: AuthContext, invoiceId: string) {
  const invoice = await queryOne<Invoice>(
    `SELECT ${INVOICE_COLUMNS} FROM public.invoices i WHERE i.id = $1`,
    [invoiceId],
  );

  if (!invoice) throw notFound('Invoice');
  assertBranchAccess(auth, invoice.branch_id);

  const [items, payments, student, branch] = await Promise.all([
    query<InvoiceItem>(
      `SELECT id, invoice_id, description, quantity, unit_price::text AS unit_price,
              amount::text AS amount, created_at
         FROM public.invoice_items WHERE invoice_id = $1 ORDER BY created_at ASC`,
      [invoiceId],
    ),
    query(
      `SELECT p.*, p.amount::text AS amount, u.full_name AS recorded_by_name
         FROM public.payments p
         LEFT JOIN public.users u ON u.id = p.recorded_by
        WHERE p.invoice_id = $1
        ORDER BY p.payment_date DESC, p.created_at DESC`,
      [invoiceId],
    ),
    queryOne(
      `SELECT id, full_name, student_code::text AS student_code, mobile, email::text AS email
         FROM public.students WHERE id = $1`,
      [invoice.student_id],
    ),
    queryOne(
      `SELECT id, name, branch_code::text AS branch_code, address, city, state, phone,
              email::text AS email
         FROM public.branches WHERE id = $1`,
      [invoice.branch_id],
    ),
  ]);

  return { invoice, items, payments, student, branch };
}

export async function cancelInvoice(
  auth: AuthContext,
  invoiceId: string,
  reason: string,
): Promise<Invoice> {
  return withTransaction(async (tx) => {
    const invoice = await tx.queryOne<Invoice>(
      `SELECT ${INVOICE_COLUMNS} FROM public.invoices i WHERE i.id = $1 FOR UPDATE`,
      [invoiceId],
    );

    if (!invoice) throw notFound('Invoice');
    assertBranchAccess(auth, invoice.branch_id);

    if (invoice.status === InvoiceStatus.CANCELLED) {
      throw conflict(ErrorCode.CONFLICT, 'This invoice is already cancelled.');
    }

    // Cancelling an invoice that has money against it would silently detach
    // the payments from any balance; reverse the payments first.
    if (compareMoney(invoice.amount_paid, '0.00') > 0) {
      throw conflict(
        ErrorCode.CONFLICT,
        'This invoice has recorded payments. Reverse them before cancelling.',
      );
    }

    const updated = await tx.queryOne<Invoice>(
      `UPDATE public.invoices
          SET status = 'CANCELLED',
              notes = coalesce(notes || E'\\n', '') || $2
        WHERE id = $1
        RETURNING ${INVOICE_RETURNING}`,
      [invoiceId, `Cancelled: ${reason}`],
    );

    await tx.query(
      `UPDATE public.fee_schedules SET status = 'CANCELLED' WHERE invoice_id = $1`,
      [invoiceId],
    );

    await recordAudit(tx, {
      branchId: invoice.branch_id,
      userId: auth.userId,
      action: AuditAction.INVOICE_CANCELLED,
      entityType: 'invoice',
      entityId: invoiceId,
      metadata: { invoice_number: invoice.invoice_number, reason },
    });

    return updated!;
  });
}

/**
 * Recomputes amount_paid, balance and status from the payment ledger.
 * Called after every payment or reversal so the invoice can never drift from
 * the rows that justify it.
 */
export async function refreshInvoiceTotals(tx: Tx, invoiceId: string): Promise<Invoice> {
  const paidRow = await tx.queryOne<{ paid: string }>(
    `SELECT coalesce(sum(amount), 0)::text AS paid
       FROM public.payments WHERE invoice_id = $1`,
    [invoiceId],
  );

  const invoice = await tx.queryOne<Invoice>(
    `UPDATE public.invoices SET amount_paid = $2::numeric
      WHERE id = $1
      RETURNING ${INVOICE_RETURNING}`,
    [invoiceId, paidRow!.paid],
  );

  if (!invoice) throw notFound('Invoice');

  const status = deriveInvoiceStatus({
    total: invoice.total,
    amountPaid: invoice.amount_paid,
    dueDate: invoice.due_date,
    today: today(),
    cancelled: invoice.status === InvoiceStatus.CANCELLED,
  });

  const updated = await tx.queryOne<Invoice>(
    `UPDATE public.invoices SET status = $2::invoice_status
      WHERE id = $1
      RETURNING ${INVOICE_RETURNING}`,
    [invoiceId, status],
  );

  await tx.query(
    `UPDATE public.fee_schedules
        SET status = CASE
              WHEN $2::invoice_status = 'PAID' THEN 'PAID'::fee_schedule_status
              WHEN $2::invoice_status = 'CANCELLED' THEN 'CANCELLED'::fee_schedule_status
              WHEN due_date < CURRENT_DATE THEN 'OVERDUE'::fee_schedule_status
              WHEN due_date = CURRENT_DATE THEN 'DUE'::fee_schedule_status
              ELSE 'UPCOMING'::fee_schedule_status
            END
      WHERE invoice_id = $1`,
    [invoiceId, status],
  );

  return updated!;
}
