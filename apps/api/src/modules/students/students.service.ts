import {
  AuditAction,
  type AuthContext,
  type Student,
  type StudentProfile,
} from '@manas/shared';
import { query, queryOne } from '../../database/pool';
import { withTransaction } from '../../database/transaction';
import {
  assertBranchAccess,
  assertBranchOperable,
  branchPredicate,
  requireBranchForWrite,
  resolveBranchScope,
} from '../../guards/branch';
import { recordAudit } from '../../services/audit';
import { notFound } from '../../utils/errors';
import { buildPaginationMeta } from '../../utils/response';
import { subtractMoney } from '../../domain/money';
import type { CreateStudentInput, UpdateStudentInput } from './students.schema';

/** Column list, parameterised by table alias so the two shapes stay in sync. */
function studentColumns(alias = ''): string {
  const p = alias ? `${alias}.` : '';
  return `
    ${p}id,
    ${p}student_code::text AS student_code,
    ${p}branch_id,
    ${p}full_name,
    ${p}mobile,
    ${p}email::text AS email,
    ${p}date_of_birth,
    ${p}address,
    ${p}emergency_contact_name,
    ${p}emergency_contact_phone,
    ${p}photo_url,
    ${p}status,
    ${p}created_at,
    ${p}updated_at
  `;
}

const SELECT_COLUMNS = studentColumns('s');
const RETURNING_COLUMNS = studentColumns();

const SORT_COLUMNS: Record<string, string> = {
  full_name: 's.full_name',
  created_at: 's.created_at',
  student_code: 's.student_code',
};

export async function listStudents(
  auth: AuthContext,
  params: {
    page: number;
    pageSize: number;
    search?: string;
    branchId?: string;
    status?: string;
    batchId?: string;
    sortBy: string;
    sortDir: 'asc' | 'desc';
  },
) {
  const { allowedBranchIds } = resolveBranchScope(auth, params.branchId);

  const conditions: string[] = [];
  const values: unknown[] = [];
  let index = 1;

  const scope = branchPredicate(allowedBranchIds, 's.branch_id', index);
  conditions.push(scope.sql);
  values.push(...scope.params);
  index = scope.nextIndex;

  if (params.branchId) {
    conditions.push(`s.branch_id = $${index}`);
    values.push(params.branchId);
    index += 1;
  }

  if (params.search) {
    conditions.push(
      `(s.full_name ILIKE $${index} OR s.mobile ILIKE $${index} OR s.student_code::text ILIKE $${index} OR s.email::text ILIKE $${index})`,
    );
    values.push(`%${params.search}%`);
    index += 1;
  }

  if (params.status) {
    conditions.push(`s.status = $${index}::student_status`);
    values.push(params.status);
    index += 1;
  }

  if (params.batchId) {
    conditions.push(
      `EXISTS (SELECT 1 FROM public.batch_students bs
                WHERE bs.student_id = s.id AND bs.batch_id = $${index} AND bs.status = 'ACTIVE')`,
    );
    values.push(params.batchId);
    index += 1;
  }

  const where = `WHERE ${conditions.join(' AND ')}`;
  // Whitelisted column name: params.sortBy is constrained by the zod enum, and
  // the map is the second gate. Never interpolate a raw client string here.
  const orderBy = `${SORT_COLUMNS[params.sortBy] ?? 's.created_at'} ${
    params.sortDir === 'asc' ? 'ASC' : 'DESC'
  }`;
  const offset = (params.page - 1) * params.pageSize;

  const rows = await query<Student & { branch_name: string }>(
    `SELECT ${SELECT_COLUMNS}, b.name AS branch_name
       FROM public.students s
       JOIN public.branches b ON b.id = s.branch_id
       ${where}
      ORDER BY ${orderBy}
      LIMIT $${index} OFFSET $${index + 1}`,
    [...values, params.pageSize, offset],
  );

  const countRow = await queryOne<{ count: number }>(
    `SELECT count(*)::bigint AS count FROM public.students s ${where}`,
    values,
  );

  return {
    data: rows,
    meta: buildPaginationMeta(params.page, params.pageSize, countRow?.count ?? 0),
  };
}

export async function getStudent(auth: AuthContext, studentId: string): Promise<Student> {
  const student = await queryOne<Student>(
    `SELECT ${SELECT_COLUMNS} FROM public.students s WHERE s.id = $1`,
    [studentId],
  );

  if (!student) throw notFound('Student');

  // The record is fetched first, then authorised: a student from another
  // branch yields 403 rather than leaking existence through a 404/200 split.
  assertBranchAccess(auth, student.branch_id);
  return student;
}

export async function createStudent(
  auth: AuthContext,
  input: CreateStudentInput,
): Promise<Student> {
  const branchId = requireBranchForWrite(auth, input.branch_id);

  return withTransaction(async (tx) => {
    await assertBranchOperable(branchId, tx);

    const codeRow = await tx.queryOne<{ code: string }>(
      `SELECT public.next_document_number($1, 'STUDENT', 'STU') AS code`,
      [branchId],
    );

    const student = await tx.queryOne<Student>(
      `INSERT INTO public.students
         (student_code, branch_id, full_name, mobile, email, date_of_birth, address,
          emergency_contact_name, emergency_contact_phone, photo_url, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING ${RETURNING_COLUMNS}`,
      [
        codeRow!.code,
        branchId,
        input.full_name,
        input.mobile,
        input.email ?? null,
        input.date_of_birth ?? null,
        input.address ?? null,
        input.emergency_contact_name ?? null,
        input.emergency_contact_phone ?? null,
        input.photo_url ?? null,
        auth.userId,
      ],
    );

    if (!student) throw notFound('Student');

    await recordAudit(tx, {
      branchId,
      userId: auth.userId,
      action: AuditAction.STUDENT_CREATED,
      entityType: 'student',
      entityId: student.id,
      metadata: { student_code: student.student_code },
    });

    return student;
  });
}

const UPDATABLE_FIELDS = [
  'full_name',
  'mobile',
  'email',
  'date_of_birth',
  'address',
  'emergency_contact_name',
  'emergency_contact_phone',
  'photo_url',
  'status',
] as const;

export async function updateStudent(
  auth: AuthContext,
  studentId: string,
  input: UpdateStudentInput,
): Promise<Student> {
  const existing = await getStudent(auth, studentId);

  const assignments: string[] = [];
  const values: unknown[] = [];
  let index = 1;

  for (const field of UPDATABLE_FIELDS) {
    const value = (input as Record<string, unknown>)[field];
    if (value === undefined) continue;

    assignments.push(
      field === 'status' ? `status = $${index}::student_status` : `${field} = $${index}`,
    );
    values.push(value);
    index += 1;
  }

  if (assignments.length === 0) return existing;

  return withTransaction(async (tx) => {
    const student = await tx.queryOne<Student>(
      `UPDATE public.students SET ${assignments.join(', ')}
        WHERE id = $${index}
        RETURNING ${RETURNING_COLUMNS}`,
      [...values, studentId],
    );

    if (!student) throw notFound('Student');

    await recordAudit(tx, {
      branchId: student.branch_id,
      userId: auth.userId,
      action: AuditAction.STUDENT_UPDATED,
      entityType: 'student',
      entityId: student.id,
      metadata: { changed: Object.keys(input) },
    });

    return student;
  });
}

/**
 * Assembles everything the student profile screen shows (PRD §9) in one
 * round trip rather than letting the frontend fan out into eight requests.
 */
export async function getStudentProfile(
  auth: AuthContext,
  studentId: string,
): Promise<StudentProfile> {
  const student = await getStudent(auth, studentId);

  const [branch, admission, seat, batch, feeSummary, invoices, payments, attendance] =
    await Promise.all([
      queryOne<NonNullable<StudentProfile['branch']>>(
        `SELECT id, name, branch_code::text AS branch_code FROM public.branches WHERE id = $1`,
        [student.branch_id],
      ),
      queryOne<NonNullable<StudentProfile['currentAdmission']>>(
        `SELECT a.* FROM public.admissions a
          WHERE a.student_id = $1 AND a.status IN ('PENDING', 'CONFIRMED')
          ORDER BY a.admission_date DESC
          LIMIT 1`,
        [studentId],
      ),
      queryOne<NonNullable<StudentProfile['currentSeat']>>(
        `SELECT st.id, st.branch_id, st.seat_number::text AS seat_number, st.floor,
                st.section, st.seat_type, st.status, st.created_at, st.updated_at
           FROM public.seat_allocations sa
           JOIN public.seats st ON st.id = sa.seat_id
          WHERE sa.student_id = $1 AND sa.status = 'ACTIVE'
          ORDER BY sa.start_date DESC
          LIMIT 1`,
        [studentId],
      ),
      queryOne<NonNullable<StudentProfile['currentBatch']>>(
        `SELECT b.id, b.branch_id, b.name, to_char(b.start_time, 'HH24:MI') AS start_time,
                to_char(b.end_time, 'HH24:MI') AS end_time, b.capacity, b.status,
                b.created_at, b.updated_at
           FROM public.batch_students bs
           JOIN public.batches b ON b.id = bs.batch_id
          WHERE bs.student_id = $1 AND bs.status = 'ACTIVE'
          LIMIT 1`,
        [studentId],
      ),
      queryOne<{
        total_invoiced: string;
        total_paid: string;
        overdue_count: number;
        next_due_date: string | null;
      }>(
        `SELECT
           coalesce(sum(i.total) FILTER (WHERE i.status <> 'CANCELLED'), 0)::text AS total_invoiced,
           coalesce(sum(i.amount_paid) FILTER (WHERE i.status <> 'CANCELLED'), 0)::text AS total_paid,
           count(*) FILTER (WHERE i.status <> 'CANCELLED' AND i.balance > 0 AND i.due_date < CURRENT_DATE)::bigint AS overdue_count,
           min(i.due_date) FILTER (WHERE i.status <> 'CANCELLED' AND i.balance > 0) AS next_due_date
         FROM public.invoices i
        WHERE i.student_id = $1`,
        [studentId],
      ),
      query(
        `SELECT * FROM public.invoices WHERE student_id = $1
          ORDER BY invoice_date DESC, created_at DESC LIMIT 10`,
        [studentId],
      ),
      query(
        `SELECT * FROM public.payments WHERE student_id = $1
          ORDER BY payment_date DESC, created_at DESC LIMIT 10`,
        [studentId],
      ),
      query(
        `SELECT * FROM public.attendance WHERE student_id = $1
          ORDER BY attendance_date DESC LIMIT 30`,
        [studentId],
      ),
    ]);

  const membershipPlan = admission
    ? await queryOne<NonNullable<StudentProfile['membershipPlan']>>(
        'SELECT * FROM public.membership_plans WHERE id = $1',
        [admission.membership_plan_id],
      )
    : null;

  const totalInvoiced = feeSummary?.total_invoiced ?? '0.00';
  const totalPaid = feeSummary?.total_paid ?? '0.00';

  return {
    student,
    branch: branch!,
    currentAdmission: admission,
    membershipPlan,
    currentSeat: seat,
    currentBatch: batch,
    feeSummary: {
      totalInvoiced,
      totalPaid,
      outstanding: subtractMoney(totalInvoiced, totalPaid),
      overdueCount: feeSummary?.overdue_count ?? 0,
      nextDueDate: feeSummary?.next_due_date ?? null,
    },
    recentInvoices: invoices as StudentProfile['recentInvoices'],
    recentPayments: payments as StudentProfile['recentPayments'],
    recentAttendance: attendance as StudentProfile['recentAttendance'],
  };
}
