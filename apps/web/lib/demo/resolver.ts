import type { PaginationMeta } from '@manas/shared';
import {
  TODAY,
  demoAdmissions,
  demoAttendanceHistory,
  demoBatches,
  demoBranches,
  demoFees,
  demoInvoices,
  demoPayments,
  demoPlans,
  demoRoster,
  demoSeats,
  demoStudents,
  demoTotals,
  demoUser,
  demoUsers,
  shiftDays,
} from './fixtures';

/**
 * Maps an API path to fixture data.
 *
 * This stands in for the entire backend while demo mode is on. It filters by
 * `branchId` where the real API would, so the branch switcher visibly does
 * something — but that is presentation, not authorization. Demo mode enforces
 * nothing.
 */

export interface DemoResult {
  data: unknown;
  meta?: PaginationMeta;
  totals?: Record<string, string>;
  message: string;
}

function paginate<T>(rows: T[], query: Record<string, unknown>): { rows: T[]; meta: PaginationMeta } {
  const page = Number(query.page ?? 1) || 1;
  const pageSize = Number(query.pageSize ?? 20) || 20;
  const start = (page - 1) * pageSize;

  return {
    rows: rows.slice(start, start + pageSize),
    meta: {
      page,
      pageSize,
      total: rows.length,
      totalPages: Math.max(1, Math.ceil(rows.length / pageSize)),
    },
  };
}

function byBranch<T extends { branch_id: string }>(rows: T[], branchId?: unknown): T[] {
  return branchId ? rows.filter((row) => row.branch_id === branchId) : rows;
}

function search<T extends object>(rows: T[], term: unknown, keys: string[]): T[] {
  if (typeof term !== 'string' || term.trim() === '') return rows;
  const needle = term.trim().toLowerCase();

  return rows.filter((row) =>
    keys.some((key) =>
      String((row as Record<string, unknown>)[key] ?? '')
        .toLowerCase()
        .includes(needle),
    ),
  );
}

const ok = (data: unknown, extra: Partial<DemoResult> = {}): DemoResult => ({
  data,
  message: 'Demo data',
  ...extra,
});

// eslint-disable-next-line complexity
export function resolveDemoRequest(
  path: string,
  query: Record<string, unknown> = {},
): DemoResult | null {
  const clean = path.split('?')[0]!.replace(/\/+$/, '');
  const segments = clean.split('/').filter(Boolean);
  const branchId = query.branchId as string | undefined;

  /* ------------------------------------------------------------- identity */

  if (clean === '/users/me') return ok(demoUser);

  if (clean === '/users') {
    const filtered = search(
      demoUsers.filter((user) => {
        if (query.role && user.role !== query.role) return false;
        if (query.status && user.status !== query.status) return false;
        return true;
      }),
      query.search,
      ['full_name', 'email'],
    );
    const { rows, meta } = paginate(filtered, query);
    return ok(rows, { meta });
  }

  /* ------------------------------------------------------------- branches */

  if (clean === '/branches') {
    const filtered = search(
      demoBranches.filter((branch) => !query.status || branch.status === query.status),
      query.search,
      ['name', 'branch_code', 'city'],
    );
    const { rows, meta } = paginate(filtered, { ...query, pageSize: query.pageSize ?? 50 });
    return ok(rows, { meta });
  }

  if (segments[0] === 'branches' && segments[1] && segments[2] === 'stats') {
    const seats = demoSeats.filter((seat) => seat.branch_id === segments[1]);
    return ok({
      total_seats: seats.length,
      occupied_seats: seats.filter((seat) => seat.status === 'OCCUPIED').length,
      available_seats: seats.filter((seat) => seat.status === 'AVAILABLE').length,
      active_students: demoStudents.filter(
        (student) => student.branch_id === segments[1] && student.status === 'ACTIVE',
      ).length,
      active_batches: demoBatches.filter((batch) => batch.branch_id === segments[1]).length,
      staff_count: demoUsers.filter((user) => user.branch_ids.includes(segments[1]!)).length,
    });
  }

  if (segments[0] === 'branches' && segments[1]) {
    const branch = demoBranches.find((candidate) => candidate.id === segments[1]);
    return branch ? ok(branch) : null;
  }

  /* ------------------------------------------------------------- students */

  if (clean === '/students') {
    const filtered = search(
      byBranch(demoStudents, branchId).filter(
        (student) => !query.status || student.status === query.status,
      ),
      query.search,
      ['full_name', 'mobile', 'student_code', 'email'],
    );
    const { rows, meta } = paginate(filtered, query);
    return ok(rows, { meta });
  }

  if (segments[0] === 'students' && segments[1] && segments[2] === 'profile') {
    const student = demoStudents.find((candidate) => candidate.id === segments[1]);
    if (!student) return null;

    const branch = demoBranches.find((candidate) => candidate.id === student.branch_id)!;
    const admission =
      demoAdmissions.find((candidate) => candidate.student_id === student.id) ?? null;
    const seat = demoSeats.find((candidate) => candidate.student_id === student.id) ?? null;
    const batch = admission
      ? (demoBatches.find((candidate) => candidate.id === admission.batch_id) ?? null)
      : null;
    const invoices = demoInvoices.filter((candidate) => candidate.student_id === student.id);
    const payments = demoPayments.filter((candidate) => candidate.student_id === student.id);

    const invoiced = invoices.reduce((total, invoice) => total + Number(invoice.total), 0);
    const paid = invoices.reduce((total, invoice) => total + Number(invoice.amount_paid), 0);

    return ok({
      student,
      branch: { id: branch.id, name: branch.name, branch_code: branch.branch_code },
      currentAdmission: admission,
      membershipPlan: admission
        ? (demoPlans.find((plan) => plan.id === admission.membership_plan_id) ?? null)
        : null,
      currentSeat: seat,
      currentBatch: batch,
      feeSummary: {
        totalInvoiced: invoiced.toFixed(2),
        totalPaid: paid.toFixed(2),
        outstanding: (invoiced - paid).toFixed(2),
        overdueCount: invoices.filter((invoice) => invoice.status === 'OVERDUE').length,
        nextDueDate:
          invoices.find((invoice) => Number(invoice.balance) > 0)?.due_date ?? null,
      },
      recentInvoices: invoices,
      recentPayments: payments,
      recentAttendance: demoAttendanceHistory
        .filter((row) => row.student_id === student.id)
        .slice(0, 10),
    });
  }

  if (segments[0] === 'students' && segments[1]) {
    const student = demoStudents.find((candidate) => candidate.id === segments[1]);
    return student ? ok(student) : null;
  }

  /* ---------------------------------------------------------- memberships */

  if (clean === '/memberships') {
    return ok(demoPlans.filter((plan) => !query.status || plan.status === query.status));
  }

  if (segments[0] === 'memberships' && segments[1]) {
    const plan = demoPlans.find((candidate) => candidate.id === segments[1]);
    return plan ? ok(plan) : null;
  }

  /* ---------------------------------------------------------------- seats */

  if (clean === '/seats') {
    let rows = byBranch(demoSeats, branchId);

    if (query.status) rows = rows.filter((seat) => seat.status === query.status);
    if (query.availableOn) {
      rows = rows.filter(
        (seat) => seat.status !== 'OCCUPIED' && seat.status !== 'MAINTENANCE' && seat.status !== 'INACTIVE',
      );
    }

    return ok(rows);
  }

  if (clean === '/seat-allocations') {
    const rows = byBranch(demoSeats, branchId)
      .filter((seat) => seat.allocation_id)
      .map((seat) => ({
        id: seat.allocation_id,
        branch_id: seat.branch_id,
        seat_id: seat.id,
        student_id: seat.student_id,
        start_date: shiftDays(TODAY, -20),
        end_date: seat.allocation_end_date,
        status: 'ACTIVE',
        seat_number: seat.seat_number,
        student_name: seat.student_name,
        student_code: seat.student_code,
      }));
    const paged = paginate(rows, query);
    return ok(paged.rows, { meta: paged.meta });
  }

  /* -------------------------------------------------------------- batches */

  if (clean === '/batches') {
    return ok(
      byBranch(demoBatches, branchId).filter(
        (batch) => !query.status || batch.status === query.status,
      ),
    );
  }

  if (segments[0] === 'batches' && segments[1] && segments[2] === 'students') {
    return ok(
      demoStudents.slice(0, 8).map((student) => ({
        id: `bs-${student.id}`,
        student_id: student.id,
        full_name: student.full_name,
        student_code: student.student_code,
        mobile: student.mobile,
        student_status: student.status,
      })),
    );
  }

  if (segments[0] === 'batches' && segments[1]) {
    const batch = demoBatches.find((candidate) => candidate.id === segments[1]);
    return batch ? ok(batch) : null;
  }

  /* ----------------------------------------------------------- admissions */

  if (clean === '/admissions/renewals') {
    return ok(
      demoAdmissions
        .filter((admission) => admission.status === 'CONFIRMED')
        .slice(0, 6)
        .map((admission) => ({
          id: admission.id,
          admission_number: admission.admission_number,
          end_date: admission.end_date,
          student_id: admission.student_id,
          full_name: admission.student_name,
          mobile: admission.student_mobile,
          student_code: admission.student_code,
          plan_name: admission.plan_name,
        })),
    );
  }

  if (clean === '/admissions') {
    const filtered = search(
      byBranch(demoAdmissions, branchId).filter(
        (admission) => !query.status || admission.status === query.status,
      ),
      query.search,
      ['admission_number', 'student_name', 'student_mobile'],
    );
    const { rows, meta } = paginate(filtered, query);
    return ok(rows, { meta });
  }

  if (segments[0] === 'admissions' && segments[1]) {
    const admission = demoAdmissions.find((candidate) => candidate.id === segments[1]);
    if (!admission) return null;
    return ok({
      admission,
      invoices: demoInvoices.filter((invoice) => invoice.admission_id === admission.id),
    });
  }

  /* -------------------------------------------------------------- finance */

  if (clean === '/invoices') {
    const filtered = search(
      byBranch(demoInvoices, branchId).filter(
        (invoice) => !query.status || invoice.status === query.status,
      ),
      query.search,
      ['invoice_number', 'student_name'],
    );
    const { rows, meta } = paginate(filtered, query);
    return ok(rows, { meta });
  }

  if (segments[0] === 'invoices' && segments[1]) {
    const invoice = demoInvoices.find((candidate) => candidate.id === segments[1]);
    if (!invoice) return null;

    const student = demoStudents.find((candidate) => candidate.id === invoice.student_id)!;
    const branch = demoBranches.find((candidate) => candidate.id === invoice.branch_id)!;
    const plan = demoPlans.find(
      (candidate) =>
        candidate.id ===
        demoAdmissions.find((admission) => admission.id === invoice.admission_id)
          ?.membership_plan_id,
    );

    return ok({
      invoice,
      items: [
        {
          id: `item-${invoice.id}`,
          invoice_id: invoice.id,
          description: `${plan?.name ?? 'Membership'} (${plan?.duration_days ?? 30} days)`,
          quantity: 1,
          unit_price: invoice.subtotal,
          amount: invoice.subtotal,
          created_at: invoice.created_at,
        },
      ],
      payments: demoPayments.filter((payment) => payment.invoice_id === invoice.id),
      student: {
        id: student.id,
        full_name: student.full_name,
        student_code: student.student_code,
        mobile: student.mobile,
        email: student.email,
      },
      branch,
    });
  }

  if (clean === '/payments') {
    const filtered = byBranch(demoPayments, branchId).filter(
      (payment) => !query.method || payment.payment_method === query.method,
    );
    const { rows, meta } = paginate(filtered, query);
    return ok(rows, { meta, totals: { collected: demoTotals.collected } });
  }

  if (clean === '/fees') {
    const filtered = byBranch(demoFees, branchId).filter(
      (fee) => !query.status || fee.status === query.status,
    );
    const { rows, meta } = paginate(filtered, query);
    return ok(rows, {
      meta,
      totals: { outstanding: demoTotals.outstanding, overdue: demoTotals.overdue },
    });
  }

  if (clean === '/fees/reminders') {
    const { rows, meta } = paginate([], query);
    return ok(rows, { meta });
  }

  /* ----------------------------------------------------------- attendance */

  if (clean === '/attendance/roster') {
    return ok(byBranch(demoRoster, branchId));
  }

  if (clean === '/attendance/summary') {
    return ok(
      Array.from({ length: 7 }, (_, index) => ({
        attendance_date: shiftDays(TODAY, -index),
        present: 38 - index,
        late: 2 + (index % 3),
        absent: 4 + (index % 2),
        biometric: 12 + index,
      })),
    );
  }

  if (clean === '/attendance') {
    const filtered = byBranch(demoAttendanceHistory, branchId).filter((row) => {
      if (query.status && row.status !== query.status) return false;
      if (query.source && row.source !== query.source) return false;
      return true;
    });
    const { rows, meta } = paginate(filtered, { ...query, pageSize: query.pageSize ?? 50 });
    return ok(rows, { meta });
  }

  /* ------------------------------------------------------------ biometric */

  if (clean === '/biometric/devices') return ok([]);
  if (clean === '/biometric/mappings') return ok([]);
  if (clean === '/biometric/unmapped') return ok([]);

  /* ------------------------------------------------ dashboard and reports */

  if (clean === '/dashboard') {
    const seats = byBranch(demoSeats, branchId);
    const students = byBranch(demoStudents, branchId);
    const invoices = byBranch(demoInvoices, branchId);

    return ok({
      branchId: branchId ?? null,
      activeStudents: students.filter((student) => student.status === 'ACTIVE').length,
      totalSeats: seats.length,
      availableSeats: seats.filter((seat) => seat.status === 'AVAILABLE').length,
      occupiedSeats: seats.filter((seat) => seat.status === 'OCCUPIED').length,
      todayAttendance: demoRoster.filter((row) => row.attendance_status).length,
      todayAdmissions: 2,
      todayCollection: '4500.00',
      pendingFees: demoTotals.outstanding,
      overdueFees: demoTotals.overdue,
      upcomingRenewals: 6,
      totalBranches: demoBranches.length,
      activeBranches: demoBranches.filter((branch) => branch.status === 'ACTIVE').length,
      revenue: demoTotals.collected,
      branchBreakdown: demoBranches.map((branch) => ({
        branchId: branch.id,
        branchName: branch.name,
        activeStudents: demoStudents.filter(
          (student) => student.branch_id === branch.id && student.status === 'ACTIVE',
        ).length,
        occupiedSeats: demoSeats.filter(
          (seat) => seat.branch_id === branch.id && seat.status === 'OCCUPIED',
        ).length,
        todayCollection: branch.status === 'ACTIVE' ? '2250.00' : '0.00',
        outstanding: invoices
          .filter((invoice) => invoice.branch_id === branch.id)
          .reduce((total, invoice) => total + Number(invoice.balance), 0)
          .toFixed(2),
      })),
    });
  }

  if (clean === '/dashboard/trends') {
    const days = Number(query.days ?? 14) || 14;
    return ok(
      Array.from({ length: days }, (_, index) => {
        const offset = days - 1 - index;
        return {
          day: shiftDays(TODAY, -offset),
          collection: (1800 + ((offset * 617) % 4200)).toFixed(2),
          attendance: 26 + ((offset * 7) % 15),
          admissions: offset % 4 === 0 ? 2 : offset % 3 === 0 ? 1 : 0,
        };
      }),
    );
  }

  if (clean === '/reports') {
    return ok([
      'active-students',
      'new-admissions',
      'expired-memberships',
      'seat-utilisation',
      'allocation-history',
      'attendance',
      'absentees',
      'collections',
      'outstanding-fees',
      'branch-revenue',
    ]);
  }

  if (segments[0] === 'reports' && segments[1]) {
    return ok(reportRows(segments[1], branchId));
  }

  if (clean === '/search') {
    const term = String(query.q ?? '').toLowerCase();
    if (term.length < 2) return ok([]);

    return ok([
      ...demoStudents
        .filter((student) => student.full_name.toLowerCase().includes(term))
        .slice(0, 5)
        .map((student) => ({
          type: 'student',
          id: student.id,
          branchId: student.branch_id,
          label: student.full_name,
          sublabel: `${student.student_code} · ${student.mobile}`,
          href: `/students/${student.id}`,
        })),
      ...demoInvoices
        .filter((invoice) => invoice.invoice_number.toLowerCase().includes(term))
        .slice(0, 3)
        .map((invoice) => ({
          type: 'invoice',
          id: invoice.id,
          branchId: invoice.branch_id,
          label: invoice.invoice_number,
          sublabel: `${invoice.status} · balance ${invoice.balance}`,
          href: `/invoices/${invoice.id}`,
        })),
    ]);
  }

  return null;
}

function reportRows(name: string, branchId?: string): Record<string, unknown>[] {
  switch (name) {
    case 'active-students':
      return byBranch(demoStudents, branchId)
        .filter((student) => student.status === 'ACTIVE')
        .map((student) => ({
          id: student.id,
          student_code: student.student_code,
          full_name: student.full_name,
          mobile: student.mobile,
          status: student.status,
          branch_name: student.branch_name,
        }));

    case 'new-admissions':
      return byBranch(demoAdmissions, branchId).map((admission) => ({
        id: admission.id,
        admission_number: admission.admission_number,
        admission_date: admission.admission_date,
        full_name: admission.student_name,
        plan_name: admission.plan_name,
        status: admission.status,
      }));

    case 'expired-memberships':
      return byBranch(demoAdmissions, branchId)
        .filter((admission) => admission.status === 'EXPIRED')
        .map((admission) => ({
          id: admission.id,
          admission_number: admission.admission_number,
          end_date: admission.end_date,
          full_name: admission.student_name,
          status: admission.status,
        }));

    case 'seat-utilisation':
      return demoBranches.map((branch) => {
        const seats = demoSeats.filter((seat) => seat.branch_id === branch.id);
        const occupied = seats.filter((seat) => seat.status === 'OCCUPIED').length;
        return {
          id: branch.id,
          branch_name: branch.name,
          total_seats: seats.length,
          occupied,
          available: seats.filter((seat) => seat.status === 'AVAILABLE').length,
          utilisation_percent: seats.length
            ? ((occupied / seats.length) * 100).toFixed(1)
            : '0.0',
        };
      });

    case 'collections':
      return byBranch(demoPayments, branchId).map((payment) => ({
        id: payment.id,
        payment_date: payment.payment_date,
        full_name: payment.student_name,
        invoice_number: payment.invoice_number,
        amount: payment.amount,
      }));

    case 'outstanding-fees':
      return byBranch(demoInvoices, branchId)
        .filter((invoice) => Number(invoice.balance) > 0)
        .map((invoice) => ({
          id: invoice.id,
          invoice_number: invoice.invoice_number,
          due_date: invoice.due_date,
          full_name: invoice.student_name,
          total: invoice.total,
          balance: invoice.balance,
          status: invoice.status,
        }));

    case 'branch-revenue':
      return demoBranches.map((branch) => ({
        id: branch.id,
        branch_name: branch.name,
        branch_code: branch.branch_code,
        collected: demoTotals.collected,
        outstanding: demoTotals.outstanding,
        active_students: demoStudents.filter(
          (student) => student.branch_id === branch.id && student.status === 'ACTIVE',
        ).length,
      }));

    case 'attendance':
      return byBranch(demoAttendanceHistory, branchId).map((row) => ({
        id: row.id,
        attendance_date: row.attendance_date,
        full_name: row.student_name,
        batch_name: row.batch_name,
        status: row.status,
        source: row.source,
      }));

    case 'absentees':
      return byBranch(demoStudents, branchId)
        .filter((_, index) => index % 5 === 0)
        .map((student) => ({
          id: student.id,
          student_code: student.student_code,
          full_name: student.full_name,
          mobile: student.mobile,
          last_seen: shiftDays(TODAY, -9),
        }));

    case 'allocation-history':
      return demoSeats
        .filter((seat) => seat.student_id)
        .map((seat) => ({
          id: seat.id,
          seat_number: seat.seat_number,
          full_name: seat.student_name,
          start_date: shiftDays(TODAY, -20),
          end_date: seat.allocation_end_date,
          status: 'ACTIVE',
        }));

    default:
      return [];
  }
}
