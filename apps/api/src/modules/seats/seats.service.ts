import {
  AuditAction,
  ErrorCode,
  SeatAllocationStatus,
  SeatStatus,
  type AuthContext,
  type Seat,
  type SeatAllocation,
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
import { buildPaginationMeta } from '../../utils/response';
import { addDays, today } from '../../domain/dates';
import type {
  AllocateSeatInput,
  ReleaseSeatInput,
  TransferSeatInput,
} from './seats.schema';

function seatColumns(alias = ''): string {
  const p = alias ? `${alias}.` : '';
  return `${p}id, ${p}branch_id, ${p}seat_number::text AS seat_number, ${p}floor,
          ${p}section, ${p}seat_type, ${p}status, ${p}created_at, ${p}updated_at`;
}

const SEAT_COLUMNS = seatColumns();

export interface SeatWithOccupant extends Seat {
  allocation_id: string | null;
  student_id: string | null;
  student_name: string | null;
  student_code: string | null;
  allocation_end_date: string | null;
}

/**
 * Seat grid data (PRD §37). Each seat carries its current occupant so the UI
 * can render occupancy without a second query per tile.
 */
export async function listSeats(
  auth: AuthContext,
  params: {
    branchId?: string;
    status?: string;
    floor?: string;
    section?: string;
    seatType?: string;
    availableOn?: string;
  },
): Promise<SeatWithOccupant[]> {
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
  if (params.status) {
    conditions.push(`s.status = $${index}::seat_status`);
    values.push(params.status);
    index += 1;
  }
  if (params.floor) {
    conditions.push(`s.floor = $${index}`);
    values.push(params.floor);
    index += 1;
  }
  if (params.section) {
    conditions.push(`s.section = $${index}`);
    values.push(params.section);
    index += 1;
  }
  if (params.seatType) {
    conditions.push(`s.seat_type = $${index}::seat_type`);
    values.push(params.seatType);
    index += 1;
  }

  // "Available on <date>" means: no ACTIVE allocation covering that date.
  if (params.availableOn) {
    conditions.push(
      `NOT EXISTS (
         SELECT 1 FROM public.seat_allocations a
          WHERE a.seat_id = s.id
            AND a.status = 'ACTIVE'
            AND daterange(a.start_date, a.end_date, '[]') @> $${index}::date
       )
       AND s.status NOT IN ('MAINTENANCE', 'INACTIVE')`,
    );
    values.push(params.availableOn);
    index += 1;
  }

  return query<SeatWithOccupant>(
    `SELECT ${seatColumns('s')},
            a.id AS allocation_id,
            a.student_id,
            st.full_name AS student_name,
            st.student_code::text AS student_code,
            a.end_date AS allocation_end_date
       FROM public.seats s
       LEFT JOIN public.seat_allocations a
              ON a.seat_id = s.id
             AND a.status = 'ACTIVE'
             AND daterange(a.start_date, a.end_date, '[]') @> CURRENT_DATE
       LEFT JOIN public.students st ON st.id = a.student_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY s.floor NULLS FIRST, s.section NULLS FIRST, s.seat_number`,
    values,
  );
}

export async function getSeat(auth: AuthContext, seatId: string): Promise<Seat> {
  const seat = await queryOne<Seat>(
    `SELECT ${SEAT_COLUMNS} FROM public.seats WHERE id = $1`,
    [seatId],
  );

  if (!seat) throw notFound('Seat');
  assertBranchAccess(auth, seat.branch_id);
  return seat;
}

export async function createSeat(
  auth: AuthContext,
  input: {
    branch_id?: string;
    seat_number: string;
    floor?: string | null;
    section?: string | null;
    seat_type: string;
    status: string;
  },
): Promise<Seat> {
  const branchId = requireBranchForWrite(auth, input.branch_id);
  await assertBranchOperable(branchId);

  const seat = await queryOne<Seat>(
    `INSERT INTO public.seats (branch_id, seat_number, floor, section, seat_type, status)
     VALUES ($1, $2, $3, $4, $5::seat_type, $6::seat_status)
     RETURNING ${SEAT_COLUMNS}`,
    [
      branchId,
      input.seat_number,
      input.floor ?? null,
      input.section ?? null,
      input.seat_type,
      input.status,
    ],
  );

  return seat!;
}

export async function bulkCreateSeats(
  auth: AuthContext,
  input: {
    branch_id?: string;
    prefix: string;
    from: number;
    to: number;
    padding: number;
    floor?: string | null;
    section?: string | null;
    seat_type: string;
  },
): Promise<{ created: number; skipped: string[] }> {
  const branchId = requireBranchForWrite(auth, input.branch_id);
  await assertBranchOperable(branchId);

  if (input.to < input.from) {
    throw badRequest(ErrorCode.VALIDATION_ERROR, '"to" must be greater than or equal to "from".');
  }
  if (input.to - input.from >= 500) {
    throw badRequest(ErrorCode.VALIDATION_ERROR, 'Create at most 500 seats per request.');
  }

  const numbers: string[] = [];
  for (let n = input.from; n <= input.to; n += 1) {
    numbers.push(`${input.prefix}${String(n).padStart(input.padding, '0')}`);
  }

  return withTransaction(async (tx) => {
    // ON CONFLICT DO NOTHING keeps the call idempotent: re-running a partially
    // completed setup adds only the seats that are genuinely missing.
    const inserted = await tx.query<{ seat_number: string }>(
      `INSERT INTO public.seats (branch_id, seat_number, floor, section, seat_type)
       SELECT $1, n, $3, $4, $5::seat_type
         FROM unnest($2::text[]) AS n
       ON CONFLICT (branch_id, seat_number) DO NOTHING
       RETURNING seat_number::text AS seat_number`,
      [branchId, numbers, input.floor ?? null, input.section ?? null, input.seat_type],
    );

    const insertedSet = new Set(inserted.map((row) => row.seat_number.toUpperCase()));

    return {
      created: inserted.length,
      skipped: numbers.filter((n) => !insertedSet.has(n.toUpperCase())),
    };
  });
}

export async function updateSeat(
  auth: AuthContext,
  seatId: string,
  input: Record<string, unknown>,
): Promise<Seat> {
  const existing = await getSeat(auth, seatId);

  const assignments: string[] = [];
  const values: unknown[] = [];
  let index = 1;

  for (const field of ['seat_number', 'floor', 'section'] as const) {
    if (input[field] === undefined) continue;
    assignments.push(`${field} = $${index++}`);
    values.push(input[field]);
  }
  if (input.seat_type !== undefined) {
    assignments.push(`seat_type = $${index++}::seat_type`);
    values.push(input.seat_type);
  }
  if (input.status !== undefined) {
    // An occupied seat cannot be quietly marked available; release first.
    if (input.status !== SeatStatus.OCCUPIED && existing.status === SeatStatus.OCCUPIED) {
      const active = await queryOne<{ id: string }>(
        `SELECT id FROM public.seat_allocations
          WHERE seat_id = $1 AND status = 'ACTIVE' LIMIT 1`,
        [seatId],
      );
      if (active) {
        throw conflict(
          ErrorCode.SEAT_NOT_AVAILABLE,
          'This seat has an active allocation. Release or transfer it before changing status.',
        );
      }
    }
    assignments.push(`status = $${index++}::seat_status`);
    values.push(input.status);
  }

  if (assignments.length === 0) return existing;

  return withTransaction(async (tx) => {
    const seat = await tx.queryOne<Seat>(
      `UPDATE public.seats SET ${assignments.join(', ')}
        WHERE id = $${index}
        RETURNING ${SEAT_COLUMNS}`,
      [...values, seatId],
    );

    // Taking a seat out of service removes capacity, so who did it and when
    // is worth being able to answer later. Only status transitions are
    // logged; renaming a seat is not an operational event.
    if (input.status !== undefined && input.status !== existing.status) {
      await recordAudit(tx, {
        branchId: seat!.branch_id,
        userId: auth.userId,
        action: AuditAction.SEAT_STATUS_CHANGED,
        entityType: 'seat',
        entityId: seat!.id,
        metadata: {
          seat_number: seat!.seat_number,
          from: existing.status,
          to: seat!.status,
        },
      });
    }

    return seat!;
  });
}

/* --------------------------------------------------------------------------
 * Allocation
 * ----------------------------------------------------------------------- */

interface SeatRow {
  id: string;
  branch_id: string;
  status: SeatStatus;
  seat_number: string;
}

async function lockSeat(tx: Tx, seatId: string): Promise<SeatRow> {
  // FOR UPDATE serialises concurrent allocations of the same seat so the
  // availability check below cannot be made on stale data.
  const seat = await tx.queryOne<SeatRow>(
    `SELECT id, branch_id, status, seat_number::text AS seat_number
       FROM public.seats WHERE id = $1 FOR UPDATE`,
    [seatId],
  );

  if (!seat) throw notFound('Seat');
  return seat;
}

export async function allocateSeat(
  auth: AuthContext,
  input: AllocateSeatInput,
): Promise<SeatAllocation> {
  const branchId = requireBranchForWrite(auth, input.branch_id);

  return withTransaction(async (tx) => {
    await assertBranchOperable(branchId, tx);

    const seat = await lockSeat(tx, input.seat_id);

    // The composite FK would also catch this, but an explicit check yields a
    // precise error instead of a generic constraint failure.
    if (seat.branch_id !== branchId) {
      throw new AppError(
        403,
        ErrorCode.BRANCH_ACCESS_DENIED,
        'The selected seat belongs to a different branch.',
      );
    }

    if (seat.status === SeatStatus.MAINTENANCE || seat.status === SeatStatus.INACTIVE) {
      throw conflict(
        ErrorCode.SEAT_NOT_AVAILABLE,
        `Seat ${seat.seat_number} is marked ${seat.status.toLowerCase()} and cannot be allocated.`,
      );
    }

    const student = await tx.queryOne<{ id: string; branch_id: string; status: string }>(
      'SELECT id, branch_id, status FROM public.students WHERE id = $1',
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

    const allocation = await tx.queryOne<SeatAllocation>(
      `INSERT INTO public.seat_allocations
         (branch_id, seat_id, student_id, start_date, end_date, allocated_by, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        branchId,
        input.seat_id,
        input.student_id,
        input.start_date,
        input.end_date ?? null,
        auth.userId,
        input.notes ?? null,
      ],
    );

    await tx.query(
      `UPDATE public.seats SET status = 'OCCUPIED' WHERE id = $1 AND status <> 'OCCUPIED'`,
      [input.seat_id],
    );

    await recordAudit(tx, {
      branchId,
      userId: auth.userId,
      action: AuditAction.SEAT_ALLOCATED,
      entityType: 'seat_allocation',
      entityId: allocation!.id,
      metadata: {
        seat_id: input.seat_id,
        student_id: input.student_id,
        start_date: input.start_date,
        end_date: input.end_date ?? null,
      },
    });

    return allocation!;
  });
}

/**
 * Closes the current allocation and opens a new one atomically (PRD §13).
 * The old allocation is marked TRANSFERRED rather than deleted so the seat's
 * history stays intact.
 */
export async function transferSeat(
  auth: AuthContext,
  input: TransferSeatInput,
): Promise<SeatAllocation> {
  return withTransaction(async (tx) => {
    const current = await tx.queryOne<SeatAllocation>(
      `SELECT * FROM public.seat_allocations WHERE id = $1 FOR UPDATE`,
      [input.allocation_id],
    );

    if (!current) throw notFound('Seat allocation');
    assertBranchAccess(auth, current.branch_id);
    await assertBranchOperable(current.branch_id, tx);

    if (current.status !== SeatAllocationStatus.ACTIVE) {
      throw conflict(
        ErrorCode.SEAT_ALLOCATION_NOT_ACTIVE,
        'Only an active allocation can be transferred.',
      );
    }

    if (input.new_seat_id === current.seat_id) {
      throw badRequest(
        ErrorCode.VALIDATION_ERROR,
        'The new seat is the same as the current seat.',
      );
    }

    if (input.effective_date < current.start_date) {
      throw badRequest(
        ErrorCode.VALIDATION_ERROR,
        'The transfer date cannot be before the allocation start date.',
      );
    }

    const newSeat = await lockSeat(tx, input.new_seat_id);

    if (newSeat.branch_id !== current.branch_id) {
      throw new AppError(
        403,
        ErrorCode.BRANCH_ACCESS_DENIED,
        'A seat can only be transferred within the same branch.',
      );
    }

    if (newSeat.status === SeatStatus.MAINTENANCE || newSeat.status === SeatStatus.INACTIVE) {
      throw conflict(
        ErrorCode.SEAT_NOT_AVAILABLE,
        `Seat ${newSeat.seat_number} is marked ${newSeat.status.toLowerCase()}.`,
      );
    }

    // The outgoing allocation ends the day before the transfer takes effect,
    // so the two windows never overlap and the EXCLUDE constraint is satisfied.
    const closingDate = addDays(input.effective_date, -1);

    await tx.query(
      `UPDATE public.seat_allocations
          SET status = 'TRANSFERRED',
              end_date = $2,
              released_at = now()
        WHERE id = $1`,
      [current.id, closingDate < current.start_date ? current.start_date : closingDate],
    );

    const allocation = await tx.queryOne<SeatAllocation>(
      `INSERT INTO public.seat_allocations
         (branch_id, seat_id, student_id, start_date, end_date, allocated_by, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        current.branch_id,
        input.new_seat_id,
        current.student_id,
        input.effective_date,
        current.end_date,
        auth.userId,
        input.notes ?? null,
      ],
    );

    await tx.query(`UPDATE public.seats SET status = 'OCCUPIED' WHERE id = $1`, [
      input.new_seat_id,
    ]);
    await releaseSeatStatusIfUnoccupied(tx, current.seat_id);

    await recordAudit(tx, {
      branchId: current.branch_id,
      userId: auth.userId,
      action: AuditAction.SEAT_TRANSFERRED,
      entityType: 'seat_allocation',
      entityId: allocation!.id,
      metadata: {
        from_seat_id: current.seat_id,
        to_seat_id: input.new_seat_id,
        student_id: current.student_id,
        effective_date: input.effective_date,
        previous_allocation_id: current.id,
      },
    });

    return allocation!;
  });
}

/**
 * A seat returns to AVAILABLE only when nothing else is actively holding it —
 * a future-dated allocation must keep it OCCUPIED.
 */
async function releaseSeatStatusIfUnoccupied(tx: Tx, seatId: string): Promise<void> {
  await tx.query(
    `UPDATE public.seats
        SET status = 'AVAILABLE'
      WHERE id = $1
        AND status = 'OCCUPIED'
        AND NOT EXISTS (
          SELECT 1 FROM public.seat_allocations
           WHERE seat_id = $1 AND status = 'ACTIVE'
        )`,
    [seatId],
  );
}

export async function releaseSeat(
  auth: AuthContext,
  input: ReleaseSeatInput,
): Promise<SeatAllocation> {
  return withTransaction(async (tx) => {
    const current = await tx.queryOne<SeatAllocation>(
      `SELECT * FROM public.seat_allocations WHERE id = $1 FOR UPDATE`,
      [input.allocation_id],
    );

    if (!current) throw notFound('Seat allocation');
    assertBranchAccess(auth, current.branch_id);

    if (current.status !== SeatAllocationStatus.ACTIVE) {
      throw conflict(
        ErrorCode.SEAT_ALLOCATION_NOT_ACTIVE,
        'This allocation is not active.',
      );
    }

    const releaseDate = input.release_date ?? today();
    const endDate = releaseDate < current.start_date ? current.start_date : releaseDate;

    const allocation = await tx.queryOne<SeatAllocation>(
      `UPDATE public.seat_allocations
          SET status = 'RELEASED', end_date = $2, released_at = now(),
              notes = coalesce($3, notes)
        WHERE id = $1
        RETURNING *`,
      [current.id, endDate, input.notes ?? null],
    );

    await releaseSeatStatusIfUnoccupied(tx, current.seat_id);

    await recordAudit(tx, {
      branchId: current.branch_id,
      userId: auth.userId,
      action: AuditAction.SEAT_RELEASED,
      entityType: 'seat_allocation',
      entityId: current.id,
      metadata: { seat_id: current.seat_id, student_id: current.student_id, end_date: endDate },
    });

    return allocation!;
  });
}

export async function listAllocations(
  auth: AuthContext,
  params: {
    page: number;
    pageSize: number;
    branchId?: string;
    seatId?: string;
    studentId?: string;
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
  if (params.seatId) {
    conditions.push(`a.seat_id = $${index}`);
    values.push(params.seatId);
    index += 1;
  }
  if (params.studentId) {
    conditions.push(`a.student_id = $${index}`);
    values.push(params.studentId);
    index += 1;
  }

  const where = `WHERE ${conditions.join(' AND ')}`;
  const offset = (params.page - 1) * params.pageSize;

  const rows = await query(
    `SELECT a.*,
            s.seat_number::text AS seat_number,
            st.full_name AS student_name,
            st.student_code::text AS student_code
       FROM public.seat_allocations a
       JOIN public.seats s ON s.id = a.seat_id
       JOIN public.students st ON st.id = a.student_id
       ${where}
      ORDER BY a.start_date DESC, a.created_at DESC
      LIMIT $${index} OFFSET $${index + 1}`,
    [...values, params.pageSize, offset],
  );

  const countRow = await queryOne<{ count: number }>(
    `SELECT count(*)::bigint AS count FROM public.seat_allocations a ${where}`,
    values,
  );

  return {
    data: rows,
    meta: buildPaginationMeta(params.page, params.pageSize, countRow?.count ?? 0),
  };
}
