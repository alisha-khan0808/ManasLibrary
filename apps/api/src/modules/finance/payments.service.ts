import {
  AuditAction,
  ErrorCode,
  InvoiceStatus,
  PaymentStatus,
  type AuthContext,
  type Invoice,
  type Payment,
} from '@manas/shared';
import { query, queryOne } from '../../database/pool';
import { withTransaction } from '../../database/transaction';
import {
  assertBranchAccess,
  branchPredicate,
  resolveBranchScope,
} from '../../guards/branch';
import { recordAudit } from '../../services/audit';
import { AppError, conflict, notFound } from '../../utils/errors';
import { buildPaginationMeta } from '../../utils/response';
import { assertPaymentAllowed, InvoiceRuleError } from '../../domain/invoice';
import { normalizeMoney, toDecimalString, toMinor } from '../../domain/money';
import { today } from '../../domain/dates';
import { invoiceColumns, refreshInvoiceTotals } from './invoices.service';

function paymentColumns(alias = ''): string {
  const p = alias ? `${alias}.` : '';
  return `${p}id, ${p}branch_id, ${p}invoice_id, ${p}student_id,
          ${p}amount::text AS amount, ${p}payment_method, ${p}transaction_reference,
          ${p}payment_date, ${p}status, ${p}reverses_payment_id, ${p}notes,
          ${p}recorded_by, ${p}created_at, ${p}updated_at`;
}

const PAYMENT_COLUMNS = paymentColumns('p');
const PAYMENT_RETURNING = paymentColumns();

export interface RecordPaymentInput {
  branch_id?: string;
  invoice_id: string;
  amount: string;
  payment_method: string;
  transaction_reference?: string | null;
  payment_date?: string;
  notes?: string | null;
}

/**
 * Records a payment and re-derives the invoice from the ledger, atomically.
 *
 * The invoice row is locked first so two cashiers cannot each see the same
 * outstanding balance and both accept a payment for it.
 */
export async function recordPayment(
  auth: AuthContext,
  input: RecordPaymentInput,
): Promise<{ payment: Payment; invoice: Invoice }> {
  return withTransaction(async (tx) => {
    const invoice = await tx.queryOne<Invoice>(
      `SELECT ${invoiceColumns('i')} FROM public.invoices i WHERE i.id = $1 FOR UPDATE`,
      [input.invoice_id],
    );

    if (!invoice) throw notFound('Invoice');
    assertBranchAccess(auth, invoice.branch_id);

    if (input.branch_id && input.branch_id !== invoice.branch_id) {
      throw new AppError(
        403,
        ErrorCode.BRANCH_ACCESS_DENIED,
        'The invoice belongs to a different branch.',
      );
    }

    const amount = normalizeMoney(input.amount);

    try {
      assertPaymentAllowed({
        invoiceStatus: invoice.status,
        total: invoice.total,
        amountPaid: invoice.amount_paid,
        paymentAmount: amount,
      });
    } catch (error) {
      if (error instanceof InvoiceRuleError) {
        const status = error.code === 'OVERPAYMENT_NOT_ALLOWED' ? 400 : 409;
        throw new AppError(status, error.code, error.message);
      }
      throw error;
    }

    const payment = await tx.queryOne<Payment>(
      `INSERT INTO public.payments
         (branch_id, invoice_id, student_id, amount, payment_method,
          transaction_reference, payment_date, notes, recorded_by)
       VALUES ($1, $2, $3, $4::numeric, $5::payment_method, $6, $7, $8, $9)
       RETURNING ${PAYMENT_RETURNING}`,
      [
        invoice.branch_id,
        invoice.id,
        invoice.student_id,
        amount,
        input.payment_method,
        input.transaction_reference ?? null,
        input.payment_date ?? today(),
        input.notes ?? null,
        auth.userId,
      ],
    );

    const updatedInvoice = await refreshInvoiceTotals(tx, invoice.id);

    await recordAudit(tx, {
      branchId: invoice.branch_id,
      userId: auth.userId,
      action: AuditAction.PAYMENT_RECORDED,
      entityType: 'payment',
      entityId: payment!.id,
      metadata: {
        invoice_number: invoice.invoice_number,
        amount,
        method: input.payment_method,
        resulting_balance: updatedInvoice.balance,
      },
    });

    return { payment: payment!, invoice: updatedInvoice };
  });
}

/**
 * Reverses a payment with a compensating entry. Payment rows are never
 * deleted (PRD §40.5), so the audit trail shows both the mistake and the fix.
 */
export async function reversePayment(
  auth: AuthContext,
  paymentId: string,
  reason: string,
): Promise<{ reversal: Payment; invoice: Invoice }> {
  return withTransaction(async (tx) => {
    const original = await tx.queryOne<Payment>(
      `SELECT ${PAYMENT_COLUMNS} FROM public.payments p WHERE p.id = $1 FOR UPDATE`,
      [paymentId],
    );

    if (!original) throw notFound('Payment');
    assertBranchAccess(auth, original.branch_id);

    if (original.status === PaymentStatus.REVERSED) {
      throw conflict(
        ErrorCode.PAYMENT_ALREADY_REVERSED,
        'This payment has already been reversed.',
      );
    }

    if (original.reverses_payment_id) {
      throw conflict(
        ErrorCode.VALIDATION_ERROR,
        'A reversal entry cannot itself be reversed.',
      );
    }

    // Lock the invoice before touching its ledger, matching recordPayment's
    // lock order so the two can never deadlock against each other.
    await tx.query('SELECT id FROM public.invoices WHERE id = $1 FOR UPDATE', [
      original.invoice_id,
    ]);

    const negatedAmount = toDecimalString(-toMinor(original.amount));

    const reversal = await tx.queryOne<Payment>(
      `INSERT INTO public.payments
         (branch_id, invoice_id, student_id, amount, payment_method,
          transaction_reference, payment_date, notes, recorded_by, reverses_payment_id)
       VALUES ($1, $2, $3, $4::numeric, $5::payment_method, $6, $7, $8, $9, $10)
       RETURNING ${PAYMENT_RETURNING}`,
      [
        original.branch_id,
        original.invoice_id,
        original.student_id,
        negatedAmount,
        original.payment_method,
        original.transaction_reference,
        today(),
        `Reversal: ${reason}`,
        auth.userId,
        original.id,
      ],
    );

    await tx.query(
      `UPDATE public.payments SET status = 'REVERSED' WHERE id = $1`,
      [original.id],
    );

    const invoice = await refreshInvoiceTotals(tx, original.invoice_id);

    await recordAudit(tx, {
      branchId: original.branch_id,
      userId: auth.userId,
      action: AuditAction.PAYMENT_REVERSED,
      entityType: 'payment',
      entityId: original.id,
      metadata: { reversal_id: reversal!.id, amount: original.amount, reason },
    });

    return { reversal: reversal!, invoice };
  });
}

export async function listPayments(
  auth: AuthContext,
  params: {
    page: number;
    pageSize: number;
    branchId?: string;
    studentId?: string;
    invoiceId?: string;
    method?: string;
    from?: string;
    to?: string;
  },
) {
  const { allowedBranchIds } = resolveBranchScope(auth, params.branchId);

  const conditions: string[] = [];
  const values: unknown[] = [];
  let index = 1;

  const scope = branchPredicate(allowedBranchIds, 'p.branch_id', index);
  conditions.push(scope.sql);
  values.push(...scope.params);
  index = scope.nextIndex;

  if (params.branchId) {
    conditions.push(`p.branch_id = $${index}`);
    values.push(params.branchId);
    index += 1;
  }
  if (params.studentId) {
    conditions.push(`p.student_id = $${index}`);
    values.push(params.studentId);
    index += 1;
  }
  if (params.invoiceId) {
    conditions.push(`p.invoice_id = $${index}`);
    values.push(params.invoiceId);
    index += 1;
  }
  if (params.method) {
    conditions.push(`p.payment_method = $${index}::payment_method`);
    values.push(params.method);
    index += 1;
  }
  if (params.from) {
    conditions.push(`p.payment_date >= $${index}`);
    values.push(params.from);
    index += 1;
  }
  if (params.to) {
    conditions.push(`p.payment_date <= $${index}`);
    values.push(params.to);
    index += 1;
  }

  const where = `WHERE ${conditions.join(' AND ')}`;
  const offset = (params.page - 1) * params.pageSize;

  const rows = await query(
    `SELECT ${PAYMENT_COLUMNS},
            s.full_name AS student_name,
            s.student_code::text AS student_code,
            i.invoice_number::text AS invoice_number,
            u.full_name AS recorded_by_name
       FROM public.payments p
       JOIN public.students s ON s.id = p.student_id
       JOIN public.invoices i ON i.id = p.invoice_id
       LEFT JOIN public.users u ON u.id = p.recorded_by
       ${where}
      ORDER BY p.payment_date DESC, p.created_at DESC
      LIMIT $${index} OFFSET $${index + 1}`,
    [...values, params.pageSize, offset],
  );

  const countRow = await queryOne<{ count: number }>(
    `SELECT count(*)::bigint AS count FROM public.payments p ${where}`,
    values,
  );

  const totalRow = await queryOne<{ total: string }>(
    `SELECT coalesce(sum(p.amount), 0)::text AS total FROM public.payments p ${where}`,
    values,
  );

  return {
    data: rows,
    meta: buildPaginationMeta(params.page, params.pageSize, countRow?.count ?? 0),
    totals: { collected: totalRow?.total ?? '0.00' },
  };
}

export async function getPayment(auth: AuthContext, paymentId: string): Promise<Payment> {
  const payment = await queryOne<Payment>(
    `SELECT ${PAYMENT_COLUMNS} FROM public.payments p WHERE p.id = $1`,
    [paymentId],
  );

  if (!payment) throw notFound('Payment');
  assertBranchAccess(auth, payment.branch_id);
  return payment;
}

/** Guards against the invoice status enum drifting away from the domain rule. */
export function isPayable(status: InvoiceStatus): boolean {
  return (
    status !== InvoiceStatus.CANCELLED &&
    status !== InvoiceStatus.PAID &&
    status !== InvoiceStatus.DRAFT
  );
}
