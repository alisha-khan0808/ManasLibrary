import {
  AttendanceStatus,
  AuditAction,
  ErrorCode,
  type Attendance,
  type AuthContext,
} from '@manas/shared';
import { query, queryOne } from '../../database/pool';
import { withTransaction } from '../../database/transaction';
import {
  assertBranchAccess,
  branchPredicate,
  requireBranchForWrite,
  resolveBranchScope,
} from '../../guards/branch';
import { recordAudit } from '../../services/audit';
import { AppError, notFound } from '../../utils/errors';
import { buildPaginationMeta } from '../../utils/response';
import { today } from '../../domain/dates';

export interface MarkAttendanceInput {
  branch_id?: string;
  student_id: string;
  batch_id?: string | null;
  attendance_date?: string;
  check_in_time?: string | null;
  check_out_time?: string | null;
  status?: AttendanceStatus;
  notes?: string | null;
}

/**
 * Manual attendance. An existing record for the same student and day is
 * updated rather than duplicated — the unique index makes that the only
 * possible outcome, so it is handled explicitly for a clean result.
 */
export async function markAttendance(
  auth: AuthContext,
  input: MarkAttendanceInput,
): Promise<Attendance> {
  const branchId = requireBranchForWrite(auth, input.branch_id);
  const attendanceDate = input.attendance_date ?? today();

  return withTransaction(async (tx) => {
    const student = await tx.queryOne<{ id: string; branch_id: string }>(
      'SELECT id, branch_id FROM public.students WHERE id = $1',
      [input.student_id],
    );

    if (!student) throw notFound('Student');
    if (student.branch_id !== branchId) {
      throw new AppError(
        403,
        ErrorCode.BRANCH_ACCESS_DENIED,
        'The selected student belongs to a different branch.',
      );
    }

    const existing = await tx.queryOne<Attendance>(
      `SELECT * FROM public.attendance
        WHERE student_id = $1 AND attendance_date = $2 FOR UPDATE`,
      [input.student_id, attendanceDate],
    );

    if (existing) {
      const updated = await tx.queryOne<Attendance>(
        `UPDATE public.attendance
            SET check_in_time  = coalesce($2::timestamptz, check_in_time),
                check_out_time = coalesce($3::timestamptz, check_out_time),
                status         = coalesce($4::attendance_status, status),
                batch_id       = coalesce($5, batch_id),
                notes          = coalesce($6, notes),
                recorded_by    = $7
          WHERE id = $1
          RETURNING *`,
        [
          existing.id,
          input.check_in_time ?? null,
          input.check_out_time ?? null,
          input.status ?? null,
          input.batch_id ?? null,
          input.notes ?? null,
          auth.userId,
        ],
      );

      await recordAudit(tx, {
        branchId,
        userId: auth.userId,
        action: AuditAction.ATTENDANCE_UPDATED,
        entityType: 'attendance',
        entityId: existing.id,
        metadata: {
          student_id: input.student_id,
          attendance_date: attendanceDate,
          previous_status: existing.status,
          new_status: updated!.status,
        },
      });

      return updated!;
    }

    const attendance = await tx.queryOne<Attendance>(
      `INSERT INTO public.attendance
         (branch_id, student_id, batch_id, attendance_date, check_in_time,
          check_out_time, status, source, notes, recorded_by)
       VALUES ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz, $7::attendance_status,
               'MANUAL'::attendance_source, $8, $9)
       RETURNING *`,
      [
        branchId,
        input.student_id,
        input.batch_id ?? null,
        attendanceDate,
        input.check_in_time ?? null,
        input.check_out_time ?? null,
        input.status ?? AttendanceStatus.PRESENT,
        input.notes ?? null,
        auth.userId,
      ],
    );

    await recordAudit(tx, {
      branchId,
      userId: auth.userId,
      action: AuditAction.ATTENDANCE_CREATED,
      entityType: 'attendance',
      entityId: attendance!.id,
      metadata: { student_id: input.student_id, attendance_date: attendanceDate },
    });

    return attendance!;
  });
}

/** Marks a whole batch present in one transaction, skipping existing rows. */
export async function markBatchAttendance(
  auth: AuthContext,
  input: { branch_id?: string; batch_id: string; attendance_date?: string; student_ids: string[] },
): Promise<{ created: number; skipped: number }> {
  const branchId = requireBranchForWrite(auth, input.branch_id);
  const attendanceDate = input.attendance_date ?? today();

  return withTransaction(async (tx) => {
    const batch = await tx.queryOne<{ id: string; branch_id: string }>(
      'SELECT id, branch_id FROM public.batches WHERE id = $1',
      [input.batch_id],
    );

    if (!batch) throw notFound('Batch');
    if (batch.branch_id !== branchId) {
      throw new AppError(
        403,
        ErrorCode.BRANCH_ACCESS_DENIED,
        'The selected batch belongs to a different branch.',
      );
    }

    const inserted = await tx.query<{ id: string }>(
      `INSERT INTO public.attendance
         (branch_id, student_id, batch_id, attendance_date, check_in_time, status, source, recorded_by)
       SELECT $1, s.id, $2, $3, now(), 'PRESENT'::attendance_status,
              'MANUAL'::attendance_source, $5
         FROM public.students s
        WHERE s.id = ANY($4::uuid[]) AND s.branch_id = $1
       ON CONFLICT (student_id, attendance_date) DO NOTHING
       RETURNING id`,
      [branchId, input.batch_id, attendanceDate, input.student_ids, auth.userId],
    );

    await recordAudit(tx, {
      branchId,
      userId: auth.userId,
      action: AuditAction.ATTENDANCE_CREATED,
      entityType: 'attendance',
      entityId: null,
      metadata: {
        batch_id: input.batch_id,
        attendance_date: attendanceDate,
        marked: inserted.length,
      },
    });

    return {
      created: inserted.length,
      skipped: input.student_ids.length - inserted.length,
    };
  });
}

export async function correctAttendance(
  auth: AuthContext,
  attendanceId: string,
  input: {
    check_in_time?: string | null;
    check_out_time?: string | null;
    status?: AttendanceStatus;
    notes?: string | null;
  },
): Promise<Attendance> {
  return withTransaction(async (tx) => {
    const existing = await tx.queryOne<Attendance>(
      'SELECT * FROM public.attendance WHERE id = $1 FOR UPDATE',
      [attendanceId],
    );

    if (!existing) throw notFound('Attendance record');
    assertBranchAccess(auth, existing.branch_id);

    const updated = await tx.queryOne<Attendance>(
      `UPDATE public.attendance
          SET check_in_time  = coalesce($2::timestamptz, check_in_time),
              check_out_time = coalesce($3::timestamptz, check_out_time),
              status         = coalesce($4::attendance_status, status),
              notes          = coalesce($5, notes),
              recorded_by    = $6
        WHERE id = $1
        RETURNING *`,
      [
        attendanceId,
        input.check_in_time ?? null,
        input.check_out_time ?? null,
        input.status ?? null,
        input.notes ?? null,
        auth.userId,
      ],
    );

    // Every correction is logged with before/after so an audit can reconstruct
    // who changed a day's attendance and to what (PRD §24).
    await recordAudit(tx, {
      branchId: existing.branch_id,
      userId: auth.userId,
      action: AuditAction.ATTENDANCE_UPDATED,
      entityType: 'attendance',
      entityId: attendanceId,
      metadata: {
        before: {
          status: existing.status,
          check_in_time: existing.check_in_time,
          check_out_time: existing.check_out_time,
        },
        after: {
          status: updated!.status,
          check_in_time: updated!.check_in_time,
          check_out_time: updated!.check_out_time,
        },
      },
    });

    return updated!;
  });
}

export async function listAttendance(
  auth: AuthContext,
  params: {
    page: number;
    pageSize: number;
    branchId?: string;
    studentId?: string;
    batchId?: string;
    date?: string;
    from?: string;
    to?: string;
    status?: string;
    source?: string;
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
  if (params.batchId) {
    conditions.push(`a.batch_id = $${index}`);
    values.push(params.batchId);
    index += 1;
  }
  if (params.date) {
    conditions.push(`a.attendance_date = $${index}`);
    values.push(params.date);
    index += 1;
  }
  if (params.from) {
    conditions.push(`a.attendance_date >= $${index}`);
    values.push(params.from);
    index += 1;
  }
  if (params.to) {
    conditions.push(`a.attendance_date <= $${index}`);
    values.push(params.to);
    index += 1;
  }
  if (params.status) {
    conditions.push(`a.status = $${index}::attendance_status`);
    values.push(params.status);
    index += 1;
  }
  if (params.source) {
    conditions.push(`a.source = $${index}::attendance_source`);
    values.push(params.source);
    index += 1;
  }

  const where = `WHERE ${conditions.join(' AND ')}`;
  const offset = (params.page - 1) * params.pageSize;

  const rows = await query(
    `SELECT a.*, s.full_name AS student_name, s.student_code::text AS student_code,
            s.mobile AS student_mobile, b.name AS batch_name
       FROM public.attendance a
       JOIN public.students s ON s.id = a.student_id
       LEFT JOIN public.batches b ON b.id = a.batch_id
       ${where}
      ORDER BY a.attendance_date DESC, a.check_in_time DESC NULLS LAST
      LIMIT $${index} OFFSET $${index + 1}`,
    [...values, params.pageSize, offset],
  );

  const countRow = await queryOne<{ count: number }>(
    `SELECT count(*)::bigint AS count FROM public.attendance a ${where}`,
    values,
  );

  return {
    data: rows,
    meta: buildPaginationMeta(params.page, params.pageSize, countRow?.count ?? 0),
  };
}

/**
 * Roster for a day: every active student in scope with their attendance row
 * if one exists. Drives the "mark today's attendance" screen, including the
 * absentee list, without a second query.
 */
export async function dailyRoster(
  auth: AuthContext,
  params: { branchId?: string; batchId?: string; date?: string },
) {
  const { allowedBranchIds } = resolveBranchScope(auth, params.branchId);
  const date = params.date ?? today();

  const conditions: string[] = [`s.status = 'ACTIVE'`];
  const values: unknown[] = [date];
  let index = 2;

  const scope = branchPredicate(allowedBranchIds, 's.branch_id', index);
  conditions.push(scope.sql);
  values.push(...scope.params);
  index = scope.nextIndex;

  if (params.branchId) {
    conditions.push(`s.branch_id = $${index}`);
    values.push(params.branchId);
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

  return query(
    `SELECT s.id AS student_id, s.full_name, s.student_code::text AS student_code,
            s.mobile, s.branch_id,
            a.id AS attendance_id, a.status AS attendance_status, a.source,
            a.check_in_time, a.check_out_time,
            bat.id AS batch_id, bat.name AS batch_name
       FROM public.students s
       LEFT JOIN public.attendance a
              ON a.student_id = s.id AND a.attendance_date = $1
       LEFT JOIN public.batch_students bs
              ON bs.student_id = s.id AND bs.status = 'ACTIVE'
       LEFT JOIN public.batches bat ON bat.id = bs.batch_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY s.full_name ASC`,
    values,
  );
}

export async function attendanceSummary(
  auth: AuthContext,
  params: { branchId?: string; from: string; to: string },
) {
  const { allowedBranchIds } = resolveBranchScope(auth, params.branchId);
  const values: unknown[] = [params.from, params.to];
  let index = 3;

  const scope = branchPredicate(allowedBranchIds, 'a.branch_id', index);
  values.push(...scope.params);
  index = scope.nextIndex;

  const branchCondition = params.branchId ? `AND a.branch_id = $${index}` : '';
  if (params.branchId) values.push(params.branchId);

  return query(
    `SELECT a.attendance_date,
            count(*) FILTER (WHERE a.status = 'PRESENT')::bigint AS present,
            count(*) FILTER (WHERE a.status = 'LATE')::bigint AS late,
            count(*) FILTER (WHERE a.status = 'ABSENT')::bigint AS absent,
            count(*) FILTER (WHERE a.source = 'BIOMETRIC')::bigint AS biometric
       FROM public.attendance a
      WHERE a.attendance_date BETWEEN $1 AND $2
        AND ${scope.sql}
        ${branchCondition}
      GROUP BY a.attendance_date
      ORDER BY a.attendance_date DESC`,
    values,
  );
}
