import {
  AuditAction,
  BatchStatus,
  ErrorCode,
  type AuthContext,
  type Batch,
  type BatchStudent,
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
import { recordAudit } from '../../services/audit';
import { AppError, badRequest, conflict, notFound } from '../../utils/errors';
import { today } from '../../domain/dates';

function batchColumns(alias = ''): string {
  const p = alias ? `${alias}.` : '';
  return `${p}id, ${p}branch_id, ${p}name,
          to_char(${p}start_time, 'HH24:MI') AS start_time,
          to_char(${p}end_time, 'HH24:MI') AS end_time,
          ${p}capacity, ${p}status, ${p}created_at, ${p}updated_at`;
}

export interface BatchWithLoad extends Batch {
  enrolled_count: number;
  available_slots: number;
}

export async function listBatches(
  auth: AuthContext,
  params: { branchId?: string; status?: string },
): Promise<BatchWithLoad[]> {
  const { allowedBranchIds } = resolveBranchScope(auth, params.branchId);

  const conditions: string[] = [];
  const values: unknown[] = [];
  let index = 1;

  const scope = branchPredicate(allowedBranchIds, 'b.branch_id', index);
  conditions.push(scope.sql);
  values.push(...scope.params);
  index = scope.nextIndex;

  if (params.branchId) {
    conditions.push(`b.branch_id = $${index}`);
    values.push(params.branchId);
    index += 1;
  }
  if (params.status) {
    conditions.push(`b.status = $${index}::batch_status`);
    values.push(params.status);
    index += 1;
  }

  return query<BatchWithLoad>(
    `SELECT ${batchColumns('b')},
            coalesce(e.enrolled, 0)::bigint AS enrolled_count,
            (b.capacity - coalesce(e.enrolled, 0))::bigint AS available_slots
       FROM public.batches b
       LEFT JOIN (
         SELECT batch_id, count(*) AS enrolled
           FROM public.batch_students
          WHERE status = 'ACTIVE'
          GROUP BY batch_id
       ) e ON e.batch_id = b.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY b.start_time ASC`,
    values,
  );
}

export async function getBatch(auth: AuthContext, batchId: string): Promise<BatchWithLoad> {
  const batch = await queryOne<BatchWithLoad>(
    `SELECT ${batchColumns('b')},
            coalesce((SELECT count(*) FROM public.batch_students bs
                       WHERE bs.batch_id = b.id AND bs.status = 'ACTIVE'), 0)::bigint AS enrolled_count,
            (b.capacity - coalesce((SELECT count(*) FROM public.batch_students bs
                       WHERE bs.batch_id = b.id AND bs.status = 'ACTIVE'), 0))::bigint AS available_slots
       FROM public.batches b WHERE b.id = $1`,
    [batchId],
  );

  if (!batch) throw notFound('Batch');
  assertBranchAccess(auth, batch.branch_id);
  return batch;
}

export async function createBatch(
  auth: AuthContext,
  input: {
    branch_id?: string;
    name: string;
    start_time: string;
    end_time: string;
    capacity: number;
    status: BatchStatus;
  },
): Promise<Batch> {
  const branchId = requireBranchForWrite(auth, input.branch_id);
  await assertBranchOperable(branchId);

  const batch = await queryOne<Batch>(
    `INSERT INTO public.batches (branch_id, name, start_time, end_time, capacity, status)
     VALUES ($1, $2, $3::time, $4::time, $5, $6::batch_status)
     RETURNING ${batchColumns()}`,
    [branchId, input.name, input.start_time, input.end_time, input.capacity, input.status],
  );

  return batch!;
}

export async function updateBatch(
  auth: AuthContext,
  batchId: string,
  input: Record<string, unknown>,
): Promise<Batch> {
  const existing = await getBatch(auth, batchId);

  // Capacity may not drop below the number of students already enrolled —
  // that would leave the batch permanently in violation of its own rule.
  if (typeof input.capacity === 'number' && input.capacity < existing.enrolled_count) {
    throw conflict(
      ErrorCode.BATCH_CAPACITY_EXCEEDED,
      `Capacity cannot be lower than the ${existing.enrolled_count} student(s) currently enrolled.`,
    );
  }

  const assignments: string[] = [];
  const values: unknown[] = [];
  let index = 1;

  if (input.name !== undefined) {
    assignments.push(`name = $${index++}`);
    values.push(input.name);
  }
  if (input.start_time !== undefined) {
    assignments.push(`start_time = $${index++}::time`);
    values.push(input.start_time);
  }
  if (input.end_time !== undefined) {
    assignments.push(`end_time = $${index++}::time`);
    values.push(input.end_time);
  }
  if (input.capacity !== undefined) {
    assignments.push(`capacity = $${index++}`);
    values.push(input.capacity);
  }
  if (input.status !== undefined) {
    assignments.push(`status = $${index++}::batch_status`);
    values.push(input.status);
  }

  if (assignments.length === 0) return existing;

  const batch = await queryOne<Batch>(
    `UPDATE public.batches SET ${assignments.join(', ')}
      WHERE id = $${index}
      RETURNING ${batchColumns()}`,
    [...values, batchId],
  );

  return batch!;
}

/**
 * Enrols a student, checking capacity with the batch row locked so two
 * simultaneous enrolments cannot both see the last free slot.
 *
 * Exported for reuse by the admission workflow, which enrols inside its own
 * transaction.
 */
export async function enrollStudentInBatch(
  tx: Tx,
  auth: AuthContext,
  params: {
    branchId: string;
    batchId: string;
    studentId: string;
    startDate: string;
    endDate?: string | null;
  },
): Promise<BatchStudent> {
  const batch = await tx.queryOne<{
    id: string;
    branch_id: string;
    capacity: number;
    status: BatchStatus;
    name: string;
  }>(
    `SELECT id, branch_id, capacity, status, name
       FROM public.batches WHERE id = $1 FOR UPDATE`,
    [params.batchId],
  );

  if (!batch) throw notFound('Batch');

  if (batch.branch_id !== params.branchId) {
    throw new AppError(
      403,
      ErrorCode.BRANCH_ACCESS_DENIED,
      'The selected batch belongs to a different branch.',
    );
  }

  if (batch.status !== BatchStatus.ACTIVE) {
    throw conflict(ErrorCode.BATCH_INACTIVE, 'An inactive batch cannot accept new students.');
  }

  const countRow = await tx.queryOne<{ count: number }>(
    `SELECT count(*)::bigint AS count FROM public.batch_students
      WHERE batch_id = $1 AND status = 'ACTIVE'`,
    [params.batchId],
  );

  if ((countRow?.count ?? 0) >= batch.capacity) {
    throw conflict(
      ErrorCode.BATCH_CAPACITY_EXCEEDED,
      `Batch ${batch.name} is full (${batch.capacity} students).`,
    );
  }

  const enrollment = await tx.queryOne<BatchStudent>(
    `INSERT INTO public.batch_students
       (branch_id, batch_id, student_id, start_date, end_date)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      params.branchId,
      params.batchId,
      params.studentId,
      params.startDate,
      params.endDate ?? null,
    ],
  );

  await recordAudit(tx, {
    branchId: params.branchId,
    userId: auth.userId,
    action: AuditAction.BATCH_ENROLLED,
    entityType: 'batch_student',
    entityId: enrollment!.id,
    metadata: { batch_id: params.batchId, student_id: params.studentId },
  });

  return enrollment!;
}

export async function enroll(
  auth: AuthContext,
  input: {
    branch_id?: string;
    batch_id: string;
    student_id: string;
    start_date: string;
    end_date?: string | null;
  },
): Promise<BatchStudent> {
  const branchId = requireBranchForWrite(auth, input.branch_id);

  return withTransaction(async (tx) => {
    await assertBranchOperable(branchId, tx);
    return enrollStudentInBatch(tx, auth, {
      branchId,
      batchId: input.batch_id,
      studentId: input.student_id,
      startDate: input.start_date,
      endDate: input.end_date ?? null,
    });
  });
}

/** Moves a student between batches, closing the old enrolment atomically. */
export async function transferBatch(
  auth: AuthContext,
  input: { enrollment_id: string; new_batch_id: string; effective_date: string },
): Promise<BatchStudent> {
  return withTransaction(async (tx) => {
    const current = await tx.queryOne<BatchStudent>(
      'SELECT * FROM public.batch_students WHERE id = $1 FOR UPDATE',
      [input.enrollment_id],
    );

    if (!current) throw notFound('Batch enrolment');
    assertBranchAccess(auth, current.branch_id);

    if (current.status !== 'ACTIVE') {
      throw conflict(ErrorCode.CONFLICT, 'Only an active enrolment can be transferred.');
    }
    if (current.batch_id === input.new_batch_id) {
      throw badRequest(ErrorCode.VALIDATION_ERROR, 'The student is already in this batch.');
    }

    // Close first: the partial unique index allows only one ACTIVE enrolment
    // per student, so the new row cannot be inserted until this lands.
    await tx.query(
      `UPDATE public.batch_students
          SET status = 'TRANSFERRED', end_date = $2
        WHERE id = $1`,
      [current.id, input.effective_date],
    );

    const enrollment = await enrollStudentInBatch(tx, auth, {
      branchId: current.branch_id,
      batchId: input.new_batch_id,
      studentId: current.student_id,
      startDate: input.effective_date,
      endDate: current.end_date,
    });

    await recordAudit(tx, {
      branchId: current.branch_id,
      userId: auth.userId,
      action: AuditAction.BATCH_TRANSFERRED,
      entityType: 'batch_student',
      entityId: enrollment.id,
      metadata: {
        from_batch_id: current.batch_id,
        to_batch_id: input.new_batch_id,
        student_id: current.student_id,
      },
    });

    return enrollment;
  });
}

export async function unenroll(
  auth: AuthContext,
  enrollmentId: string,
): Promise<BatchStudent> {
  return withTransaction(async (tx) => {
    const current = await tx.queryOne<BatchStudent>(
      'SELECT * FROM public.batch_students WHERE id = $1 FOR UPDATE',
      [enrollmentId],
    );

    if (!current) throw notFound('Batch enrolment');
    assertBranchAccess(auth, current.branch_id);

    const updated = await tx.queryOne<BatchStudent>(
      `UPDATE public.batch_students
          SET status = 'COMPLETED', end_date = coalesce(end_date, $2)
        WHERE id = $1
        RETURNING *`,
      [enrollmentId, today()],
    );

    return updated!;
  });
}

export async function listBatchStudents(auth: AuthContext, batchId: string) {
  const batch = await getBatch(auth, batchId);

  return query(
    `SELECT bs.*, s.full_name, s.student_code::text AS student_code, s.mobile, s.status AS student_status
       FROM public.batch_students bs
       JOIN public.students s ON s.id = bs.student_id
      WHERE bs.batch_id = $1 AND bs.status = 'ACTIVE'
      ORDER BY s.full_name ASC`,
    [batch.id],
  );
}
