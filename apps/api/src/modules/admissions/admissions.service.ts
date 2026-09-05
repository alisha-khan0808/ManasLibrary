import {
  AdmissionStatus,
  AuditAction,
  ErrorCode,
  MembershipPlanStatus,
  SeatStatus,
  type Admission,
  type AuthContext,
  type Invoice,
  type MembershipPlan,
  type Payment,
  type Student,
} from '@manas/shared';
import { query, queryOne } from '../../database/pool';
import { withTransaction, type Tx } from '../../database/transaction';
import {
  assertBranchAccess,
  assertBranchOperable,
  branchPredicate,
  requireBranchForWrite,
  resolveBranchScope,
} from '../../guards/branch';
import { enrollStudentInBatch } from '../batches/batches.service';
import { createInvoiceInTransaction, refreshInvoiceTotals } from '../finance/invoices.service';
import { recordAudit } from '../../services/audit';
import { AppError, badRequest, conflict, notFound } from '../../utils/errors';
import { buildPaginationMeta } from '../../utils/response';
import { addDays, membershipEndDate, today } from '../../domain/dates';
import { assertPaymentAllowed, InvoiceRuleError } from '../../domain/invoice';
import { compareMoney, normalizeMoney, subtractMoney } from '../../domain/money';
import type { CreateAdmissionInput } from './admissions.schema';

export interface AdmissionResult {
  admission: Admission;
  student: Student;
  invoice: Invoice;
  payment: Payment | null;
}

/**
 * Quotes an admission without writing anything, so the guided form can show a
 * fee summary before the user commits (PRD §38).
 *
 * The same calculation runs again inside `createAdmission`; the quote is never
 * trusted as input.
 */
export async function quoteAdmission(
  auth: AuthContext,
  params: { branch_id?: string; membership_plan_id: string; start_date: string; discount?: string },
) {
  const branchId = requireBranchForWrite(auth, params.branch_id);

  const plan = await queryOne<MembershipPlan>(
    `SELECT id, name, duration_days, price::text AS price, description, status,
            created_at, updated_at
       FROM public.membership_plans WHERE id = $1`,
    [params.membership_plan_id],
  );

  if (!plan) throw notFound('Membership plan');
  if (plan.status !== MembershipPlanStatus.ACTIVE) {
    throw conflict(
      ErrorCode.MEMBERSHIP_PLAN_INACTIVE,
      'This membership plan is inactive and cannot be sold.',
    );
  }

  const discount = normalizeMoney(params.discount ?? '0');

  if (compareMoney(discount, plan.price) > 0) {
    throw badRequest(
      ErrorCode.VALIDATION_ERROR,
      'Discount cannot exceed the membership plan price.',
    );
  }

  const endDate = membershipEndDate(params.start_date, plan.duration_days);

  return {
    branchId,
    plan,
    startDate: params.start_date,
    endDate,
    subtotal: plan.price,
    discount,
    tax: '0.00',
    total: subtractMoney(plan.price, discount),
  };
}

/**
 * The full admission transaction (PRD §16).
 *
 * Student, admission, batch enrolment, seat allocation, invoice and the
 * opening payment either all commit or none do — a half-finished admission
 * (student created but no seat, or invoice with no admission) is exactly what
 * this guards against.
 */
export async function createAdmission(
  auth: AuthContext,
  input: CreateAdmissionInput,
): Promise<AdmissionResult> {
  const branchId = requireBranchForWrite(auth, input.branch_id);

  return withTransaction(async (tx) => {
    await assertBranchOperable(branchId, tx);

    const plan = await loadSellablePlan(tx, input.membership_plan_id);
    const student = await resolveStudent(tx, auth, branchId, input);

    const startDate = input.start_date;
    const endDate = membershipEndDate(startDate, plan.duration_days);

    const discount = normalizeMoney(input.discount ?? '0');
    if (compareMoney(discount, plan.price) > 0) {
      throw badRequest(
        ErrorCode.VALIDATION_ERROR,
        'Discount cannot exceed the membership plan price.',
      );
    }

    const admissionNumberRow = await tx.queryOne<{ code: string }>(
      `SELECT public.next_document_number($1, 'ADMISSION', 'ADM') AS code`,
      [branchId],
    );

    // Seat and batch are validated before the admission row is written so a
    // rejected seat does not consume an admission number.
    if (input.batch_id) {
      await enrollStudentInBatch(tx, auth, {
        branchId,
        batchId: input.batch_id,
        studentId: student.id,
        startDate,
        endDate,
      });
    }

    if (input.seat_id) {
      await allocateSeatInTransaction(tx, auth, {
        branchId,
        seatId: input.seat_id,
        studentId: student.id,
        startDate,
        endDate,
      });
    }

    const admission = await tx.queryOne<Admission>(
      `INSERT INTO public.admissions
         (admission_number, branch_id, student_id, membership_plan_id, batch_id, seat_id,
          admission_date, start_date, end_date, status, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'CONFIRMED'::admission_status, $10, $11)
       RETURNING *`,
      [
        admissionNumberRow!.code,
        branchId,
        student.id,
        plan.id,
        input.batch_id ?? null,
        input.seat_id ?? null,
        input.admission_date ?? today(),
        startDate,
        endDate,
        input.notes ?? null,
        auth.userId,
      ],
    );

    const invoice = await createInvoiceInTransaction(tx, auth, {
      branchId,
      studentId: student.id,
      admissionId: admission!.id,
      invoiceDate: input.admission_date ?? today(),
      dueDate: input.due_date ?? startDate,
      discount,
      tax: '0.00',
      notes: `Admission ${admission!.admission_number} — ${plan.name}`,
      lines: [
        {
          description: `${plan.name} membership (${plan.duration_days} days, ${startDate} to ${endDate})`,
          quantity: 1,
          unit_price: plan.price,
        },
      ],
    });

    let payment: Payment | null = null;

    if (input.payment) {
      payment = await recordOpeningPayment(tx, auth, invoice, input.payment);
      // Re-read the invoice so the caller sees the post-payment balance.
      Object.assign(invoice, await refreshInvoiceTotals(tx, invoice.id));
    }

    // A student who was INACTIVE or EXPIRED becomes ACTIVE on readmission.
    await tx.query(
      `UPDATE public.students SET status = 'ACTIVE'
        WHERE id = $1 AND status <> 'SUSPENDED'`,
      [student.id],
    );

    await recordAudit(tx, {
      branchId,
      userId: auth.userId,
      action: AuditAction.ADMISSION_CREATED,
      entityType: 'admission',
      entityId: admission!.id,
      metadata: {
        admission_number: admission!.admission_number,
        student_id: student.id,
        plan: plan.name,
        seat_id: input.seat_id ?? null,
        batch_id: input.batch_id ?? null,
        invoice_number: invoice.invoice_number,
      },
    });

    return { admission: admission!, student, invoice, payment };
  });
}

async function loadSellablePlan(tx: Tx, planId: string): Promise<MembershipPlan> {
  const plan = await tx.queryOne<MembershipPlan>(
    `SELECT id, name, duration_days, price::text AS price, description, status,
            created_at, updated_at
       FROM public.membership_plans WHERE id = $1`,
    [planId],
  );

  if (!plan) throw notFound('Membership plan');
  if (plan.status !== MembershipPlanStatus.ACTIVE) {
    throw conflict(
      ErrorCode.MEMBERSHIP_PLAN_INACTIVE,
      'This membership plan is inactive and cannot be sold.',
    );
  }

  return plan;
}

/**
 * An admission either attaches to an existing student or creates one in the
 * same transaction, so a validation failure later cannot leave a stray record.
 */
async function resolveStudent(
  tx: Tx,
  auth: AuthContext,
  branchId: string,
  input: CreateAdmissionInput,
): Promise<Student> {
  if (input.student_id) {
    const existing = await tx.queryOne<Student>(
      `SELECT id, student_code::text AS student_code, branch_id, full_name, mobile,
              email::text AS email, date_of_birth, address, emergency_contact_name,
              emergency_contact_phone, photo_url, status, created_at, updated_at
         FROM public.students WHERE id = $1`,
      [input.student_id],
    );

    if (!existing) throw notFound('Student');
    if (existing.branch_id !== branchId) {
      throw new AppError(
        403,
        ErrorCode.BRANCH_ACCESS_DENIED,
        'The selected student belongs to a different branch.',
      );
    }
    if (existing.status === 'SUSPENDED') {
      throw conflict(
        ErrorCode.CONFLICT,
        'This student is suspended and cannot be admitted.',
      );
    }

    return existing;
  }

  if (!input.student) {
    throw badRequest(
      ErrorCode.VALIDATION_ERROR,
      'Provide either an existing student_id or new student details.',
    );
  }

  const codeRow = await tx.queryOne<{ code: string }>(
    `SELECT public.next_document_number($1, 'STUDENT', 'STU') AS code`,
    [branchId],
  );

  const created = await tx.queryOne<Student>(
    `INSERT INTO public.students
       (student_code, branch_id, full_name, mobile, email, date_of_birth, address,
        emergency_contact_name, emergency_contact_phone, photo_url, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id, student_code::text AS student_code, branch_id, full_name, mobile,
               email::text AS email, date_of_birth, address, emergency_contact_name,
               emergency_contact_phone, photo_url, status, created_at, updated_at`,
    [
      codeRow!.code,
      branchId,
      input.student.full_name,
      input.student.mobile,
      input.student.email ?? null,
      input.student.date_of_birth ?? null,
      input.student.address ?? null,
      input.student.emergency_contact_name ?? null,
      input.student.emergency_contact_phone ?? null,
      input.student.photo_url ?? null,
      auth.userId,
    ],
  );

  await recordAudit(tx, {
    branchId,
    userId: auth.userId,
    action: AuditAction.STUDENT_CREATED,
    entityType: 'student',
    entityId: created!.id,
    metadata: { student_code: created!.student_code, via: 'admission' },
  });

  return created!;
}

async function allocateSeatInTransaction(
  tx: Tx,
  auth: AuthContext,
  params: {
    branchId: string;
    seatId: string;
    studentId: string;
    startDate: string;
    endDate: string;
  },
): Promise<void> {
  const seat = await tx.queryOne<{
    id: string;
    branch_id: string;
    status: SeatStatus;
    seat_number: string;
  }>(
    `SELECT id, branch_id, status, seat_number::text AS seat_number
       FROM public.seats WHERE id = $1 FOR UPDATE`,
    [params.seatId],
  );

  if (!seat) throw notFound('Seat');

  if (seat.branch_id !== params.branchId) {
    throw new AppError(
      403,
      ErrorCode.BRANCH_ACCESS_DENIED,
      'The selected seat belongs to a different branch.',
    );
  }

  if (seat.status === SeatStatus.MAINTENANCE || seat.status === SeatStatus.INACTIVE) {
    throw conflict(
      ErrorCode.SEAT_NOT_AVAILABLE,
      `Seat ${seat.seat_number} is marked ${seat.status.toLowerCase()}.`,
    );
  }

  const allocation = await tx.queryOne<{ id: string }>(
    `INSERT INTO public.seat_allocations
       (branch_id, seat_id, student_id, start_date, end_date, allocated_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      params.branchId,
      params.seatId,
      params.studentId,
      params.startDate,
      params.endDate,
      auth.userId,
    ],
  );

  await tx.query(`UPDATE public.seats SET status = 'OCCUPIED' WHERE id = $1`, [params.seatId]);

  await recordAudit(tx, {
    branchId: params.branchId,
    userId: auth.userId,
    action: AuditAction.SEAT_ALLOCATED,
    entityType: 'seat_allocation',
    entityId: allocation!.id,
    metadata: { seat_id: params.seatId, student_id: params.studentId, via: 'admission' },
  });
}

async function recordOpeningPayment(
  tx: Tx,
  auth: AuthContext,
  invoice: Invoice,
  payment: NonNullable<CreateAdmissionInput['payment']>,
): Promise<Payment> {
  const amount = normalizeMoney(payment.amount);

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

  const row = await tx.queryOne<Payment>(
    `INSERT INTO public.payments
       (branch_id, invoice_id, student_id, amount, payment_method,
        transaction_reference, payment_date, notes, recorded_by)
     VALUES ($1, $2, $3, $4::numeric, $5::payment_method, $6, $7, $8, $9)
     RETURNING id, branch_id, invoice_id, student_id, amount::text AS amount,
               payment_method, transaction_reference, payment_date, status,
               reverses_payment_id, notes, recorded_by, created_at, updated_at`,
    [
      invoice.branch_id,
      invoice.id,
      invoice.student_id,
      amount,
      payment.payment_method,
      payment.transaction_reference ?? null,
      payment.payment_date ?? today(),
      payment.notes ?? null,
      auth.userId,
    ],
  );

  await recordAudit(tx, {
    branchId: invoice.branch_id,
    userId: auth.userId,
    action: AuditAction.PAYMENT_RECORDED,
    entityType: 'payment',
    entityId: row!.id,
    metadata: { invoice_number: invoice.invoice_number, amount, via: 'admission' },
  });

  return row!;
}

/* --------------------------------------------------------------------------
 * Reads
 * ----------------------------------------------------------------------- */

export async function listAdmissions(
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

  const scope = branchPredicate(allowedBranchIds, 'a.branch_id', index);
  conditions.push(scope.sql);
  values.push(...scope.params);
  index = scope.nextIndex;

  if (params.branchId) {
    conditions.push(`a.branch_id = $${index}`);
    values.push(params.branchId);
    index += 1;
  }
  if (params.studentId) {
    conditions.push(`a.student_id = $${index}`);
    values.push(params.studentId);
    index += 1;
  }
  if (params.status) {
    conditions.push(`a.status = $${index}::admission_status`);
    values.push(params.status);
    index += 1;
  }
  if (params.from) {
    conditions.push(`a.admission_date >= $${index}`);
    values.push(params.from);
    index += 1;
  }
  if (params.to) {
    conditions.push(`a.admission_date <= $${index}`);
    values.push(params.to);
    index += 1;
  }
  if (params.search) {
    conditions.push(
      `(a.admission_number::text ILIKE $${index} OR s.full_name ILIKE $${index} OR s.mobile ILIKE $${index})`,
    );
    values.push(`%${params.search}%`);
    index += 1;
  }

  const where = `WHERE ${conditions.join(' AND ')}`;
  const offset = (params.page - 1) * params.pageSize;

  const rows = await query(
    `SELECT a.*,
            a.admission_number::text AS admission_number,
            s.full_name AS student_name,
            s.student_code::text AS student_code,
            s.mobile AS student_mobile,
            mp.name AS plan_name,
            seat.seat_number::text AS seat_number,
            b.name AS batch_name
       FROM public.admissions a
       JOIN public.students s ON s.id = a.student_id
       JOIN public.membership_plans mp ON mp.id = a.membership_plan_id
       LEFT JOIN public.seats seat ON seat.id = a.seat_id
       LEFT JOIN public.batches b ON b.id = a.batch_id
       ${where}
      ORDER BY a.admission_date DESC, a.created_at DESC
      LIMIT $${index} OFFSET $${index + 1}`,
    [...values, params.pageSize, offset],
  );

  const countRow = await queryOne<{ count: number }>(
    `SELECT count(*)::bigint AS count
       FROM public.admissions a
       JOIN public.students s ON s.id = a.student_id
       ${where}`,
    values,
  );

  return {
    data: rows,
    meta: buildPaginationMeta(params.page, params.pageSize, countRow?.count ?? 0),
  };
}

export async function getAdmission(auth: AuthContext, admissionId: string) {
  const admission = await queryOne<Admission>(
    `SELECT a.*, a.admission_number::text AS admission_number
       FROM public.admissions a WHERE a.id = $1`,
    [admissionId],
  );

  if (!admission) throw notFound('Admission');
  assertBranchAccess(auth, admission.branch_id);

  const invoices = await query(
    `SELECT id, invoice_number::text AS invoice_number, total::text AS total,
            amount_paid::text AS amount_paid, balance::text AS balance, status, due_date
       FROM public.invoices WHERE admission_id = $1
       ORDER BY invoice_date DESC`,
    [admissionId],
  );

  return { admission, invoices };
}

/**
 * Cancels an admission and unwinds what it created: the seat is released, the
 * batch enrolment is closed and an unpaid invoice is cancelled. Paid invoices
 * are left alone — money needs an explicit reversal, not an implicit one.
 */
export async function cancelAdmission(
  auth: AuthContext,
  admissionId: string,
  reason: string,
): Promise<Admission> {
  return withTransaction(async (tx) => {
    const admission = await tx.queryOne<Admission>(
      'SELECT * FROM public.admissions WHERE id = $1 FOR UPDATE',
      [admissionId],
    );

    if (!admission) throw notFound('Admission');
    assertBranchAccess(auth, admission.branch_id);

    if (admission.status === AdmissionStatus.CANCELLED) {
      throw conflict(ErrorCode.CONFLICT, 'This admission is already cancelled.');
    }

    const updated = await tx.queryOne<Admission>(
      `UPDATE public.admissions
          SET status = 'CANCELLED', notes = coalesce(notes || E'\\n', '') || $2
        WHERE id = $1
        RETURNING *`,
      [admissionId, `Cancelled: ${reason}`],
    );

    const releaseDate = today();

    await tx.query(
      `UPDATE public.seat_allocations
          SET status = 'CANCELLED', released_at = now(),
              end_date = GREATEST(start_date, $2::date)
        WHERE student_id = $1 AND status = 'ACTIVE'`,
      [admission.student_id, releaseDate],
    );

    await tx.query(
      `UPDATE public.seats SET status = 'AVAILABLE'
        WHERE id = $1
          AND status = 'OCCUPIED'
          AND NOT EXISTS (
            SELECT 1 FROM public.seat_allocations
             WHERE seat_id = $1 AND status = 'ACTIVE'
          )`,
      [admission.seat_id],
    );

    await tx.query(
      `UPDATE public.batch_students
          SET status = 'CANCELLED', end_date = GREATEST(start_date, $2::date)
        WHERE student_id = $1 AND status = 'ACTIVE'`,
      [admission.student_id, releaseDate],
    );

    await tx.query(
      `UPDATE public.invoices SET status = 'CANCELLED'
        WHERE admission_id = $1 AND amount_paid = 0 AND status <> 'CANCELLED'`,
      [admissionId],
    );

    await tx.query(
      `UPDATE public.fee_schedules SET status = 'CANCELLED'
        WHERE invoice_id IN (
          SELECT id FROM public.invoices
           WHERE admission_id = $1 AND status = 'CANCELLED'
        )`,
      [admissionId],
    );

    await recordAudit(tx, {
      branchId: admission.branch_id,
      userId: auth.userId,
      action: AuditAction.ADMISSION_CANCELLED,
      entityType: 'admission',
      entityId: admissionId,
      metadata: { admission_number: admission.admission_number, reason },
    });

    return updated!;
  });
}

/**
 * Marks memberships that ran out as EXPIRED. Idempotent: re-running it on the
 * same day changes nothing, which is what makes it safe as a scheduled job.
 */
export async function expireLapsedAdmissions(asOf = today()): Promise<number> {
  return withTransaction(async (tx) => {
    const expired = await tx.query<{ id: string; student_id: string; seat_id: string | null }>(
      `UPDATE public.admissions
          SET status = 'EXPIRED'
        WHERE status = 'CONFIRMED' AND end_date < $1::date
        RETURNING id, student_id, seat_id`,
      [asOf],
    );

    if (expired.length === 0) return 0;

    const studentIds = expired.map((row) => row.student_id);

    await tx.query(
      `UPDATE public.seat_allocations
          SET status = 'EXPIRED', released_at = now()
        WHERE student_id = ANY($1::uuid[]) AND status = 'ACTIVE' AND end_date < $2::date`,
      [studentIds, asOf],
    );

    await tx.query(
      `UPDATE public.seats s
          SET status = 'AVAILABLE'
        WHERE s.status = 'OCCUPIED'
          AND NOT EXISTS (
            SELECT 1 FROM public.seat_allocations a
             WHERE a.seat_id = s.id AND a.status = 'ACTIVE'
          )`,
    );

    await tx.query(
      `UPDATE public.batch_students
          SET status = 'COMPLETED'
        WHERE student_id = ANY($1::uuid[]) AND status = 'ACTIVE' AND end_date < $2::date`,
      [studentIds, asOf],
    );

    await tx.query(
      `UPDATE public.students
          SET status = 'EXPIRED'
        WHERE id = ANY($1::uuid[]) AND status = 'ACTIVE'`,
      [studentIds],
    );

    return expired.length;
  });
}

/** Memberships ending within the window — drives the renewals dashboard card. */
export async function upcomingRenewals(
  auth: AuthContext,
  params: { branchId?: string; days: number },
) {
  const { allowedBranchIds } = resolveBranchScope(auth, params.branchId);
  const scope = branchPredicate(allowedBranchIds, 'a.branch_id', 1);

  const values: unknown[] = [...scope.params];
  const branchCondition = params.branchId
    ? `AND a.branch_id = $${scope.nextIndex}`
    : '';
  if (params.branchId) values.push(params.branchId);

  return query(
    `SELECT a.id, a.admission_number::text AS admission_number, a.end_date,
            s.id AS student_id, s.full_name, s.mobile,
            s.student_code::text AS student_code, mp.name AS plan_name
       FROM public.admissions a
       JOIN public.students s ON s.id = a.student_id
       JOIN public.membership_plans mp ON mp.id = a.membership_plan_id
      WHERE ${scope.sql}
        ${branchCondition}
        AND a.status = 'CONFIRMED'
        AND a.end_date BETWEEN CURRENT_DATE AND $${values.length + 1}::date
      ORDER BY a.end_date ASC
      LIMIT 100`,
    [...values, addDays(today(), params.days)],
  );
}
