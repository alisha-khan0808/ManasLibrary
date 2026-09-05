import type { AuthContext, SearchResult } from '@manas/shared';
import { query } from '../../database/pool';
import { branchPredicate, resolveBranchScope } from '../../guards/branch';

/**
 * Reports (PRD §30).
 *
 * Every report starts from the same branch scope, so a report can never widen
 * a user's visibility beyond what the list screens allow.
 */

interface ReportParams {
  branchId?: string;
  from?: string;
  to?: string;
  batchId?: string;
}

/**
 * Builds the branch predicate for a report.
 *
 * `column` is the fully-qualified branch column for the driving table — for
 * `public.branches` that is its own primary key, hence the explicit parameter
 * rather than an alias-plus-`branch_id` assumption.
 */
function scopeFor(
  auth: AuthContext,
  branchId: string | undefined,
  column: string,
  start = 1,
) {
  const { allowedBranchIds } = resolveBranchScope(auth, branchId);
  const scope = branchPredicate(allowedBranchIds, column, start);
  const values = [...scope.params];

  let sql = scope.sql;
  let nextIndex = scope.nextIndex;

  if (branchId) {
    sql = `${sql} AND ${column} = $${nextIndex}`;
    values.push(branchId);
    nextIndex += 1;
  }

  return { sql, values, nextIndex };
}

/* ---------------------------------- Students --------------------------- */

export async function activeStudentsReport(auth: AuthContext, params: ReportParams) {
  const scope = scopeFor(auth, params.branchId, 's.branch_id');

  return query(
    `SELECT s.id, s.student_code::text AS student_code, s.full_name, s.mobile,
            s.status, b.name AS branch_name,
            seat.seat_number::text AS seat_number,
            bat.name AS batch_name,
            a.end_date AS membership_end
       FROM public.students s
       JOIN public.branches b ON b.id = s.branch_id
       LEFT JOIN public.admissions a
              ON a.student_id = s.id AND a.status = 'CONFIRMED'
       LEFT JOIN public.seats seat ON seat.id = a.seat_id
       LEFT JOIN public.batches bat ON bat.id = a.batch_id
      WHERE ${scope.sql} AND s.status = 'ACTIVE'
      ORDER BY b.name, s.full_name`,
    scope.values,
  );
}

export async function newAdmissionsReport(auth: AuthContext, params: ReportParams) {
  const scope = scopeFor(auth, params.branchId, 'a.branch_id');
  const values = [...scope.values, params.from ?? '1900-01-01', params.to ?? '2999-12-31'];

  return query(
    `SELECT a.admission_number::text AS admission_number, a.admission_date,
            a.start_date, a.end_date, a.status,
            s.full_name, s.student_code::text AS student_code, s.mobile,
            b.name AS branch_name, mp.name AS plan_name, mp.price::text AS plan_price
       FROM public.admissions a
       JOIN public.students s ON s.id = a.student_id
       JOIN public.branches b ON b.id = a.branch_id
       JOIN public.membership_plans mp ON mp.id = a.membership_plan_id
      WHERE ${scope.sql}
        AND a.admission_date BETWEEN $${scope.nextIndex}::date AND $${scope.nextIndex + 1}::date
      ORDER BY a.admission_date DESC`,
    values,
  );
}

export async function expiredMembershipsReport(auth: AuthContext, params: ReportParams) {
  const scope = scopeFor(auth, params.branchId, 'a.branch_id');

  return query(
    `SELECT a.admission_number::text AS admission_number, a.end_date,
            s.full_name, s.student_code::text AS student_code, s.mobile, s.status,
            b.name AS branch_name, mp.name AS plan_name
       FROM public.admissions a
       JOIN public.students s ON s.id = a.student_id
       JOIN public.branches b ON b.id = a.branch_id
       JOIN public.membership_plans mp ON mp.id = a.membership_plan_id
      WHERE ${scope.sql}
        AND (a.status = 'EXPIRED' OR (a.status = 'CONFIRMED' AND a.end_date < CURRENT_DATE))
      ORDER BY a.end_date DESC`,
    scope.values,
  );
}

/* ----------------------------------- Seats ----------------------------- */

export async function seatUtilisationReport(auth: AuthContext, params: ReportParams) {
  const scope = scopeFor(auth, params.branchId, 's.branch_id');

  return query(
    `SELECT b.id AS branch_id, b.name AS branch_name,
            count(*)::bigint AS total_seats,
            count(*) FILTER (WHERE s.status = 'OCCUPIED')::bigint AS occupied,
            count(*) FILTER (WHERE s.status = 'AVAILABLE')::bigint AS available,
            count(*) FILTER (WHERE s.status = 'RESERVED')::bigint AS reserved,
            count(*) FILTER (WHERE s.status = 'MAINTENANCE')::bigint AS maintenance,
            round(
              100.0 * count(*) FILTER (WHERE s.status = 'OCCUPIED') / NULLIF(count(*), 0),
              1
            )::text AS utilisation_percent
       FROM public.seats s
       JOIN public.branches b ON b.id = s.branch_id
      WHERE ${scope.sql}
      GROUP BY b.id, b.name
      ORDER BY b.name`,
    scope.values,
  );
}

export async function allocationHistoryReport(auth: AuthContext, params: ReportParams) {
  const scope = scopeFor(auth, params.branchId, 'a.branch_id');
  const values = [...scope.values, params.from ?? '1900-01-01', params.to ?? '2999-12-31'];

  return query(
    `SELECT a.start_date, a.end_date, a.status,
            seat.seat_number::text AS seat_number,
            s.full_name, s.student_code::text AS student_code,
            b.name AS branch_name, u.full_name AS allocated_by_name
       FROM public.seat_allocations a
       JOIN public.seats seat ON seat.id = a.seat_id
       JOIN public.students s ON s.id = a.student_id
       JOIN public.branches b ON b.id = a.branch_id
       LEFT JOIN public.users u ON u.id = a.allocated_by
      WHERE ${scope.sql}
        AND a.start_date BETWEEN $${scope.nextIndex}::date AND $${scope.nextIndex + 1}::date
      ORDER BY a.start_date DESC`,
    values,
  );
}

/* -------------------------------- Attendance --------------------------- */

export async function attendanceReport(auth: AuthContext, params: ReportParams) {
  const scope = scopeFor(auth, params.branchId, 'a.branch_id');
  const values = [...scope.values, params.from ?? '1900-01-01', params.to ?? '2999-12-31'];
  const index = scope.nextIndex + 2;

  const batchCondition = params.batchId ? `AND a.batch_id = $${index}` : '';
  if (params.batchId) values.push(params.batchId);

  return query(
    `SELECT a.attendance_date, a.status, a.source,
            a.check_in_time, a.check_out_time,
            s.full_name, s.student_code::text AS student_code,
            b.name AS branch_name, bat.name AS batch_name
       FROM public.attendance a
       JOIN public.students s ON s.id = a.student_id
       JOIN public.branches b ON b.id = a.branch_id
       LEFT JOIN public.batches bat ON bat.id = a.batch_id
      WHERE ${scope.sql}
        AND a.attendance_date BETWEEN $${scope.nextIndex}::date AND $${scope.nextIndex + 1}::date
        ${batchCondition}
      ORDER BY a.attendance_date DESC, s.full_name`,
    values,
  );
}

/**
 * Active students with no attendance row in the window. Uses NOT EXISTS rather
 * than a left join so a student with attendance on one day of the range is not
 * reported as absent for the range.
 */
export async function absenteeReport(auth: AuthContext, params: ReportParams) {
  const scope = scopeFor(auth, params.branchId, 's.branch_id');
  const values = [...scope.values, params.from ?? '1900-01-01', params.to ?? '2999-12-31'];

  return query(
    `SELECT s.id, s.student_code::text AS student_code, s.full_name, s.mobile,
            b.name AS branch_name,
            (SELECT max(a.attendance_date) FROM public.attendance a
              WHERE a.student_id = s.id) AS last_seen
       FROM public.students s
       JOIN public.branches b ON b.id = s.branch_id
      WHERE ${scope.sql}
        AND s.status = 'ACTIVE'
        AND NOT EXISTS (
          SELECT 1 FROM public.attendance a
           WHERE a.student_id = s.id
             AND a.attendance_date BETWEEN $${scope.nextIndex}::date AND $${scope.nextIndex + 1}::date
             AND a.status <> 'ABSENT'
        )
      ORDER BY b.name, s.full_name`,
    values,
  );
}

/* --------------------------------- Finance ----------------------------- */

export async function collectionReport(auth: AuthContext, params: ReportParams) {
  const scope = scopeFor(auth, params.branchId, 'p.branch_id');
  const values = [...scope.values, params.from ?? '1900-01-01', params.to ?? '2999-12-31'];

  return query(
    `SELECT p.payment_date, b.name AS branch_name,
            count(*)::bigint AS payment_count,
            coalesce(sum(p.amount), 0)::text AS total,
            coalesce(sum(p.amount) FILTER (WHERE p.payment_method = 'CASH'), 0)::text AS cash,
            coalesce(sum(p.amount) FILTER (WHERE p.payment_method = 'UPI'), 0)::text AS upi,
            coalesce(sum(p.amount) FILTER (WHERE p.payment_method = 'BANK_TRANSFER'), 0)::text AS bank_transfer,
            coalesce(sum(p.amount) FILTER (WHERE p.payment_method = 'CARD'), 0)::text AS card,
            coalesce(sum(p.amount) FILTER (WHERE p.payment_method = 'OTHER'), 0)::text AS other
       FROM public.payments p
       JOIN public.branches b ON b.id = p.branch_id
      WHERE ${scope.sql}
        AND p.payment_date BETWEEN $${scope.nextIndex}::date AND $${scope.nextIndex + 1}::date
      GROUP BY p.payment_date, b.name
      ORDER BY p.payment_date DESC`,
    values,
  );
}

export async function outstandingFeesReport(auth: AuthContext, params: ReportParams) {
  const scope = scopeFor(auth, params.branchId, 'i.branch_id');

  return query(
    `SELECT i.invoice_number::text AS invoice_number, i.invoice_date, i.due_date,
            i.total::text AS total, i.amount_paid::text AS amount_paid,
            i.balance::text AS balance, i.status,
            (CURRENT_DATE - i.due_date) AS days_overdue,
            s.full_name, s.student_code::text AS student_code, s.mobile,
            b.name AS branch_name
       FROM public.invoices i
       JOIN public.students s ON s.id = i.student_id
       JOIN public.branches b ON b.id = i.branch_id
      WHERE ${scope.sql}
        AND i.status <> 'CANCELLED'
        AND i.balance > 0
      ORDER BY i.due_date ASC`,
    scope.values,
  );
}

export async function branchRevenueReport(auth: AuthContext, params: ReportParams) {
  const scope = scopeFor(auth, params.branchId, 'b.id');
  const values = [...scope.values, params.from ?? '1900-01-01', params.to ?? '2999-12-31'];
  const fromIndex = scope.nextIndex;
  const toIndex = scope.nextIndex + 1;

  return query(
    `SELECT b.id AS branch_id, b.name AS branch_name, b.branch_code::text AS branch_code,
            coalesce((SELECT sum(p.amount) FROM public.payments p
                       WHERE p.branch_id = b.id
                         AND p.payment_date BETWEEN $${fromIndex}::date AND $${toIndex}::date), 0)::text AS collected,
            coalesce((SELECT sum(i.total) FROM public.invoices i
                       WHERE i.branch_id = b.id AND i.status <> 'CANCELLED'
                         AND i.invoice_date BETWEEN $${fromIndex}::date AND $${toIndex}::date), 0)::text AS invoiced,
            coalesce((SELECT sum(i.balance) FROM public.invoices i
                       WHERE i.branch_id = b.id AND i.status <> 'CANCELLED' AND i.balance > 0), 0)::text AS outstanding,
            (SELECT count(*) FROM public.students s
              WHERE s.branch_id = b.id AND s.status = 'ACTIVE')::bigint AS active_students
       FROM public.branches b
      WHERE ${scope.sql}
      ORDER BY b.name`,
    values,
  );
}

/* ---------------------------------- Search ----------------------------- */

/**
 * Cross-entity search (PRD §29). Results are unioned server-side so the
 * branch filter is applied identically to every entity type.
 */
export async function search(
  auth: AuthContext,
  params: { q: string; branchId?: string; limit: number },
): Promise<SearchResult[]> {
  const { allowedBranchIds } = resolveBranchScope(auth, params.branchId);
  const scope = branchPredicate(allowedBranchIds, 'branch_id', 2);

  const values: unknown[] = [`%${params.q}%`, ...scope.params];
  const branchFilter = params.branchId ? `AND branch_id = $${scope.nextIndex}` : '';
  if (params.branchId) values.push(params.branchId);

  const limitIndex = values.length + 1;
  values.push(params.limit);

  const rows = await query<{
    type: SearchResult['type'];
    id: string;
    branch_id: string;
    label: string;
    sublabel: string;
  }>(
    `(
       SELECT 'student'::text AS type, id, branch_id,
              full_name AS label,
              student_code::text || ' · ' || mobile AS sublabel
         FROM public.students
        WHERE ${scope.sql} ${branchFilter}
          AND (full_name ILIKE $1 OR mobile ILIKE $1 OR student_code::text ILIKE $1 OR email::text ILIKE $1)
        LIMIT $${limitIndex}
     )
     UNION ALL
     (
       SELECT 'invoice'::text AS type, id, branch_id,
              invoice_number::text AS label,
              status::text || ' · balance ' || balance::text AS sublabel
         FROM public.invoices
        WHERE ${scope.sql} ${branchFilter}
          AND invoice_number::text ILIKE $1
        LIMIT $${limitIndex}
     )
     UNION ALL
     (
       SELECT 'admission'::text AS type, id, branch_id,
              admission_number::text AS label,
              status::text || ' · ' || start_date::text AS sublabel
         FROM public.admissions
        WHERE ${scope.sql} ${branchFilter}
          AND admission_number::text ILIKE $1
        LIMIT $${limitIndex}
     )
     UNION ALL
     (
       SELECT 'seat'::text AS type, id, branch_id,
              'Seat ' || seat_number::text AS label,
              status::text AS sublabel
         FROM public.seats
        WHERE ${scope.sql} ${branchFilter}
          AND seat_number::text ILIKE $1
        LIMIT $${limitIndex}
     )
     UNION ALL
     (
       SELECT 'batch'::text AS type, id, branch_id,
              name AS label,
              to_char(start_time, 'HH24:MI') || '–' || to_char(end_time, 'HH24:MI') AS sublabel
         FROM public.batches
        WHERE ${scope.sql} ${branchFilter}
          AND name ILIKE $1
        LIMIT $${limitIndex}
     )`,
    values,
  );

  const hrefFor = (type: SearchResult['type'], id: string): string => {
    switch (type) {
      case 'student':
        return `/students/${id}`;
      case 'invoice':
        return `/invoices/${id}`;
      case 'admission':
        return `/admissions`;
      case 'seat':
        return `/seats`;
      case 'batch':
        return `/batches`;
    }
  };

  return rows.map((row) => ({
    type: row.type,
    id: row.id,
    branchId: row.branch_id,
    label: row.label,
    sublabel: row.sublabel,
    href: hrefFor(row.type, row.id),
  }));
}
