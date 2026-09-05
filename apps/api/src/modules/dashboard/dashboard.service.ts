import { UserRole, type AuthContext, type BranchDashboard, type SuperAdminDashboard } from '@manas/shared';
import { query, queryOne } from '../../database/pool';
import { branchPredicate, resolveBranchScope } from '../../guards/branch';
import { today } from '../../domain/dates';

interface MetricsRow {
  active_students: number;
  total_seats: number;
  available_seats: number;
  occupied_seats: number;
  today_attendance: number;
  today_admissions: number;
  today_collection: string;
  pending_fees: string;
  overdue_fees: string;
  upcoming_renewals: number;
}

/**
 * Dashboard metrics (PRD §28).
 *
 * Every sub-query carries the same branch predicate, so a Branch Admin's
 * "total seats" can never include another branch's seats — the scope is
 * applied once and threaded through rather than trusted per query.
 */
export async function getDashboard(
  auth: AuthContext,
  params: { branchId?: string; date?: string },
): Promise<BranchDashboard | SuperAdminDashboard> {
  const { allowedBranchIds } = resolveBranchScope(auth, params.branchId);
  const asOf = params.date ?? today();

  const scope = branchPredicate(allowedBranchIds, 'branch_id', 2);
  const values: unknown[] = [asOf, ...scope.params];

  const branchFilter = params.branchId ? `AND branch_id = $${scope.nextIndex}` : '';
  if (params.branchId) values.push(params.branchId);

  const where = `${scope.sql} ${branchFilter}`;

  const metrics = await queryOne<MetricsRow>(
    `SELECT
       (SELECT count(*) FROM public.students
         WHERE status = 'ACTIVE' AND ${where})::bigint AS active_students,

       (SELECT count(*) FROM public.seats
         WHERE ${where})::bigint AS total_seats,

       (SELECT count(*) FROM public.seats
         WHERE status = 'AVAILABLE' AND ${where})::bigint AS available_seats,

       (SELECT count(*) FROM public.seats
         WHERE status = 'OCCUPIED' AND ${where})::bigint AS occupied_seats,

       (SELECT count(*) FROM public.attendance
         WHERE attendance_date = $1::date AND status <> 'ABSENT' AND ${where})::bigint AS today_attendance,

       (SELECT count(*) FROM public.admissions
         WHERE admission_date = $1::date AND status <> 'CANCELLED' AND ${where})::bigint AS today_admissions,

       (SELECT coalesce(sum(amount), 0) FROM public.payments
         WHERE payment_date = $1::date AND ${where})::text AS today_collection,

       (SELECT coalesce(sum(balance), 0) FROM public.invoices
         WHERE status IN ('PENDING', 'PARTIALLY_PAID') AND due_date >= $1::date
           AND ${where})::text AS pending_fees,

       (SELECT coalesce(sum(balance), 0) FROM public.invoices
         WHERE status <> 'CANCELLED' AND balance > 0 AND due_date < $1::date
           AND ${where})::text AS overdue_fees,

       (SELECT count(*) FROM public.admissions
         WHERE status = 'CONFIRMED'
           AND end_date BETWEEN $1::date AND ($1::date + INTERVAL '15 days')
           AND ${where})::bigint AS upcoming_renewals`,
    values,
  );

  const base: BranchDashboard = {
    branchId: params.branchId ?? null,
    activeStudents: metrics?.active_students ?? 0,
    totalSeats: metrics?.total_seats ?? 0,
    availableSeats: metrics?.available_seats ?? 0,
    occupiedSeats: metrics?.occupied_seats ?? 0,
    todayAttendance: metrics?.today_attendance ?? 0,
    todayAdmissions: metrics?.today_admissions ?? 0,
    todayCollection: metrics?.today_collection ?? '0.00',
    pendingFees: metrics?.pending_fees ?? '0.00',
    overdueFees: metrics?.overdue_fees ?? '0.00',
    upcomingRenewals: metrics?.upcoming_renewals ?? 0,
  };

  if (auth.role !== UserRole.SUPER_ADMIN) {
    return base;
  }

  const branchScope = branchPredicate(allowedBranchIds, 'b.id', 2);
  const branchValues: unknown[] = [asOf, ...branchScope.params];

  const [counts, breakdown, revenue] = await Promise.all([
    queryOne<{ total: number; active: number }>(
      `SELECT count(*)::bigint AS total,
              count(*) FILTER (WHERE status = 'ACTIVE')::bigint AS active
         FROM public.branches`,
    ),
    query<{
      branch_id: string;
      branch_name: string;
      active_students: number;
      occupied_seats: number;
      today_collection: string;
      outstanding: string;
    }>(
      `SELECT b.id AS branch_id, b.name AS branch_name,
              (SELECT count(*) FROM public.students s
                WHERE s.branch_id = b.id AND s.status = 'ACTIVE')::bigint AS active_students,
              (SELECT count(*) FROM public.seats st
                WHERE st.branch_id = b.id AND st.status = 'OCCUPIED')::bigint AS occupied_seats,
              (SELECT coalesce(sum(p.amount), 0) FROM public.payments p
                WHERE p.branch_id = b.id AND p.payment_date = $1::date)::text AS today_collection,
              (SELECT coalesce(sum(i.balance), 0) FROM public.invoices i
                WHERE i.branch_id = b.id AND i.status <> 'CANCELLED' AND i.balance > 0)::text AS outstanding
         FROM public.branches b
        WHERE ${branchScope.sql}
        ORDER BY b.name ASC`,
      branchValues,
    ),
    queryOne<{ total: string }>(
      `SELECT coalesce(sum(amount), 0)::text AS total
         FROM public.payments
        WHERE payment_date >= date_trunc('month', $1::date)
          AND payment_date <= $1::date`,
      [asOf],
    ),
  ]);

  const dashboard: SuperAdminDashboard = {
    ...base,
    totalBranches: counts?.total ?? 0,
    activeBranches: counts?.active ?? 0,
    revenue: revenue?.total ?? '0.00',
    branchBreakdown: breakdown.map((row) => ({
      branchId: row.branch_id,
      branchName: row.branch_name,
      activeStudents: row.active_students,
      occupiedSeats: row.occupied_seats,
      todayCollection: row.today_collection,
      outstanding: row.outstanding,
    })),
  };

  return dashboard;
}

/** Last 14 days of collections and attendance, for the dashboard charts. */
export async function getTrends(
  auth: AuthContext,
  params: { branchId?: string; days: number },
) {
  const { allowedBranchIds } = resolveBranchScope(auth, params.branchId);

  // The same scope is expressed once per alias so the predicate is generated,
  // never string-rewritten. All three share $2 (and $3 when a branch is named).
  const values: unknown[] = [params.days];
  const scopeParamIndex = 2;
  const scope = branchPredicate(allowedBranchIds, 'x.branch_id', scopeParamIndex);
  values.push(...scope.params);

  const branchParamIndex = scope.nextIndex;
  if (params.branchId) values.push(params.branchId);

  const predicateFor = (alias: string) => {
    const base = branchPredicate(allowedBranchIds, `${alias}.branch_id`, scopeParamIndex).sql;
    return params.branchId
      ? `${base} AND ${alias}.branch_id = $${branchParamIndex}`
      : base;
  };

  return query(
    `WITH days AS (
       SELECT generate_series(CURRENT_DATE - ($1::int - 1), CURRENT_DATE, '1 day')::date AS day
     )
     SELECT d.day,
            coalesce((SELECT sum(p.amount) FROM public.payments p
                       WHERE p.payment_date = d.day AND ${predicateFor('p')}), 0)::text AS collection,
            coalesce((SELECT count(*) FROM public.attendance a
                       WHERE a.attendance_date = d.day AND a.status <> 'ABSENT'
                         AND ${predicateFor('a')}), 0)::bigint AS attendance,
            coalesce((SELECT count(*) FROM public.admissions ad
                       WHERE ad.admission_date = d.day AND ad.status <> 'CANCELLED'
                         AND ${predicateFor('ad')}), 0)::bigint AS admissions
       FROM days d
      ORDER BY d.day ASC`,
    values,
  );
}
