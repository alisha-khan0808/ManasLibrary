import type {
  Admission,
  AppUser,
  Attendance,
  Batch,
  Branch,
  Invoice,
  MembershipPlan,
  Payment,
  Seat,
  Student,
} from '@manas/shared';
import { DEMO_USER_ID } from './config';

/**
 * Static demo data.
 *
 * Everything here is deterministic — no randomness, no `Date.now()` inside
 * render — so the server and client produce identical markup and React does
 * not report a hydration mismatch.
 */

function anchorToday(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
    .toISOString()
    .slice(0, 10);
}

export const TODAY = anchorToday();

export function shiftDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const TS = `${TODAY}T09:00:00.000Z`;

/* ------------------------------------------------------------------ user */

export const demoUser: AppUser = {
  id: DEMO_USER_ID,
  email: 'demo@manaslibrary.local',
  full_name: 'Demo Super Admin',
  phone: '9999900000',
  role: 'SUPER_ADMIN',
  status: 'ACTIVE',
  created_at: TS,
  updated_at: TS,
  branch_ids: [],
};

/* --------------------------------------------------------------- branches */

export const demoBranches: Branch[] = [
  {
    id: 'b0000000-0000-4000-8000-000000000001',
    branch_code: 'MLB01',
    name: 'Manas Library — Main Branch',
    address: 'Station Road, Near Gandhi Maidan',
    city: 'Patna',
    state: 'Bihar',
    phone: '9999900001',
    email: 'main@manaslibrary.local',
    opening_time: '06:00',
    closing_time: '22:00',
    status: 'ACTIVE',
    created_at: TS,
    updated_at: TS,
  },
  {
    id: 'b0000000-0000-4000-8000-000000000002',
    branch_code: 'MLB02',
    name: 'Manas Library — Kankarbagh',
    address: 'Main Road, Kankarbagh',
    city: 'Patna',
    state: 'Bihar',
    phone: '9999900002',
    email: 'kankarbagh@manaslibrary.local',
    opening_time: '07:00',
    closing_time: '21:00',
    status: 'ACTIVE',
    created_at: TS,
    updated_at: TS,
  },
  {
    id: 'b0000000-0000-4000-8000-000000000003',
    branch_code: 'MLB03',
    name: 'Manas Library — Danapur',
    address: 'Station Road, Danapur',
    city: 'Patna',
    state: 'Bihar',
    phone: '9999900003',
    email: 'danapur@manaslibrary.local',
    opening_time: '06:30',
    closing_time: '21:30',
    status: 'INACTIVE',
    created_at: TS,
    updated_at: TS,
  },
];

const MAIN = demoBranches[0]!.id;
const SECOND = demoBranches[1]!.id;

/* ---------------------------------------------------------------- plans */

export const demoPlans: MembershipPlan[] = [
  {
    id: 'p0000000-0000-4000-8000-000000000001',
    name: 'Monthly',
    duration_days: 30,
    price: '1200.00',
    description: 'One month of library access',
    status: 'ACTIVE',
    created_at: TS,
    updated_at: TS,
  },
  {
    id: 'p0000000-0000-4000-8000-000000000002',
    name: 'Quarterly',
    duration_days: 90,
    price: '3300.00',
    description: 'Three months, discounted',
    status: 'ACTIVE',
    created_at: TS,
    updated_at: TS,
  },
  {
    id: 'p0000000-0000-4000-8000-000000000003',
    name: 'Half-Yearly',
    duration_days: 180,
    price: '6000.00',
    description: 'Six months, better value',
    status: 'ACTIVE',
    created_at: TS,
    updated_at: TS,
  },
  {
    id: 'p0000000-0000-4000-8000-000000000004',
    name: 'Yearly',
    duration_days: 365,
    price: '11000.00',
    description: 'Best value for regular students',
    status: 'ACTIVE',
    created_at: TS,
    updated_at: TS,
  },
];

/* -------------------------------------------------------------- students */

const NAMES = [
  'Aarav Kumar',
  'Priya Sharma',
  'Rohan Verma',
  'Ananya Singh',
  'Vikram Yadav',
  'Sneha Gupta',
  'Aditya Mishra',
  'Ishita Roy',
  'Karan Thakur',
  'Meera Jha',
  'Nikhil Ranjan',
  'Pooja Devi',
  'Rahul Prasad',
  'Sanjana Rai',
  'Tarun Choudhary',
  'Divya Anand',
];

const STUDENT_STATUSES = ['ACTIVE', 'ACTIVE', 'ACTIVE', 'ACTIVE', 'EXPIRED', 'ACTIVE'] as const;

export interface DemoStudent extends Student {
  branch_name: string;
}

export const demoStudents: DemoStudent[] = NAMES.map((name, index) => {
  const branch = index < 11 ? demoBranches[0]! : demoBranches[1]!;

  return {
    id: `50000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    student_code: `STU-${branch.branch_code}-2026-${String(index + 1).padStart(6, '0')}`,
    branch_id: branch.id,
    full_name: name,
    mobile: `98${String(76543200 + index * 7).padStart(8, '0')}`,
    email: `${name.split(' ')[0]!.toLowerCase()}@example.com`,
    date_of_birth: shiftDays(TODAY, -(7300 + index * 90)),
    address: `${12 + index} Rajendra Nagar, Patna`,
    emergency_contact_name: 'Guardian',
    emergency_contact_phone: `98${String(76500000 + index * 11).padStart(8, '0')}`,
    photo_url: null,
    status: STUDENT_STATUSES[index % STUDENT_STATUSES.length]!,
    created_at: `${shiftDays(TODAY, -(index * 9 + 3))}T10:15:00.000Z`,
    updated_at: TS,
    branch_name: branch.name,
  };
});

const activeStudents = demoStudents.filter((student) => student.status === 'ACTIVE');

/* ---------------------------------------------------------------- seats */

export interface DemoSeat extends Seat {
  allocation_id: string | null;
  student_id: string | null;
  student_name: string | null;
  student_code: string | null;
  allocation_end_date: string | null;
}

function buildSeats(branchId: string, prefix: string, floor: string, count: number, offset: number) {
  return Array.from({ length: count }, (_, i) => {
    const index = i + offset;
    const number = `${prefix}${String(i + 1).padStart(2, '0')}`;

    // Deterministic spread across the seat statuses.
    const occupant = i < activeStudents.length && i % 3 !== 2 ? activeStudents[i] : undefined;
    const maintenance = i === count - 2;
    const reserved = i === count - 1;

    const status: Seat['status'] = maintenance
      ? 'MAINTENANCE'
      : reserved
        ? 'RESERVED'
        : occupant
          ? 'OCCUPIED'
          : 'AVAILABLE';

    return {
      id: `5ea70000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      branch_id: branchId,
      seat_number: number,
      floor,
      section: prefix,
      seat_type: i % 5 === 0 ? 'AC' : 'STANDARD',
      status,
      created_at: TS,
      updated_at: TS,
      allocation_id: occupant && status === 'OCCUPIED' ? `a11c0000-${index}` : null,
      student_id: occupant && status === 'OCCUPIED' ? occupant.id : null,
      student_name: occupant && status === 'OCCUPIED' ? occupant.full_name : null,
      student_code: occupant && status === 'OCCUPIED' ? occupant.student_code : null,
      allocation_end_date:
        occupant && status === 'OCCUPIED' ? shiftDays(TODAY, 20 - (i % 25)) : null,
    } satisfies DemoSeat;
  });
}

export const demoSeats: DemoSeat[] = [
  ...buildSeats(MAIN, 'A', 'Ground', 20, 0),
  ...buildSeats(MAIN, 'B', 'First', 20, 20),
  ...buildSeats(SECOND, 'A', 'Ground', 12, 40),
];

/* -------------------------------------------------------------- batches */

export interface DemoBatch extends Batch {
  enrolled_count: number;
  available_slots: number;
}

export const demoBatches: DemoBatch[] = [
  {
    id: 'ba700000-0000-4000-8000-000000000001',
    branch_id: MAIN,
    name: 'Morning',
    start_time: '06:00',
    end_time: '10:00',
    capacity: 60,
    status: 'ACTIVE',
    created_at: TS,
    updated_at: TS,
    enrolled_count: 44,
    available_slots: 16,
  },
  {
    id: 'ba700000-0000-4000-8000-000000000002',
    branch_id: MAIN,
    name: 'Afternoon',
    start_time: '12:00',
    end_time: '16:00',
    capacity: 60,
    status: 'ACTIVE',
    created_at: TS,
    updated_at: TS,
    enrolled_count: 60,
    available_slots: 0,
  },
  {
    id: 'ba700000-0000-4000-8000-000000000003',
    branch_id: MAIN,
    name: 'Evening',
    start_time: '17:00',
    end_time: '21:00',
    capacity: 50,
    status: 'ACTIVE',
    created_at: TS,
    updated_at: TS,
    enrolled_count: 31,
    available_slots: 19,
  },
  {
    id: 'ba700000-0000-4000-8000-000000000004',
    branch_id: SECOND,
    name: 'Morning',
    start_time: '07:00',
    end_time: '11:00',
    capacity: 40,
    status: 'ACTIVE',
    created_at: TS,
    updated_at: TS,
    enrolled_count: 12,
    available_slots: 28,
  },
];

/* ------------------------------------------------------------ admissions */

export interface DemoAdmission extends Admission {
  student_name: string;
  student_code: string;
  student_mobile: string;
  plan_name: string;
  seat_number: string | null;
  batch_name: string | null;
}

export const demoAdmissions: DemoAdmission[] = demoStudents.slice(0, 12).map((student, index) => {
  const plan = demoPlans[index % demoPlans.length]!;
  const start = shiftDays(TODAY, -(index * 8 + 2));
  const seat = demoSeats.find((candidate) => candidate.student_id === student.id) ?? null;
  const batch = demoBatches[index % 3]!;

  return {
    id: `ad000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    admission_number: `ADM-MLB01-2026-${String(index + 1).padStart(6, '0')}`,
    branch_id: student.branch_id,
    student_id: student.id,
    membership_plan_id: plan.id,
    batch_id: batch.id,
    seat_id: seat?.id ?? null,
    admission_date: start,
    start_date: start,
    end_date: shiftDays(start, plan.duration_days - 1),
    status: student.status === 'EXPIRED' ? 'EXPIRED' : 'CONFIRMED',
    created_by: DEMO_USER_ID,
    created_at: `${start}T10:30:00.000Z`,
    updated_at: TS,
    student_name: student.full_name,
    student_code: student.student_code,
    student_mobile: student.mobile,
    plan_name: plan.name,
    seat_number: seat?.seat_number ?? null,
    batch_name: batch.name,
  };
});

/* -------------------------------------------------------------- invoices */

export interface DemoInvoice extends Invoice {
  student_name: string;
  student_code: string;
}

function money(value: number): string {
  return value.toFixed(2);
}

export const demoInvoices: DemoInvoice[] = demoAdmissions.map((admission, index) => {
  const plan = demoPlans.find((candidate) => candidate.id === admission.membership_plan_id)!;
  const subtotal = Number(plan.price);
  const discount = index % 4 === 0 ? 200 : 0;
  const total = subtotal - discount;

  // A deliberate spread: fully paid, part paid, unpaid and overdue.
  const paidFraction = [1, 1, 0.5, 0, 1, 0.25][index % 6]!;
  const paid = Math.round(total * paidFraction);
  const due = shiftDays(admission.start_date, index % 5 === 3 ? -6 : 9);

  const balance = total - paid;
  const status: Invoice['status'] =
    balance <= 0 ? 'PAID' : due < TODAY ? 'OVERDUE' : paid > 0 ? 'PARTIALLY_PAID' : 'PENDING';

  return {
    id: `19000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    invoice_number: `INV-MLB01-2026-${String(index + 1).padStart(6, '0')}`,
    branch_id: admission.branch_id,
    student_id: admission.student_id,
    admission_id: admission.id,
    invoice_date: admission.admission_date,
    due_date: due,
    subtotal: money(subtotal),
    discount: money(discount),
    tax: '0.00',
    total: money(total),
    amount_paid: money(paid),
    balance: money(balance),
    status,
    notes: `Admission ${admission.admission_number} — ${plan.name}`,
    created_at: `${admission.admission_date}T10:31:00.000Z`,
    updated_at: TS,
    student_name: admission.student_name,
    student_code: admission.student_code,
  };
});

/* -------------------------------------------------------------- payments */

export interface DemoPayment extends Payment {
  student_name: string;
  student_code: string;
  invoice_number: string;
  recorded_by_name: string | null;
}

const METHODS = ['CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'UPI'] as const;

export const demoPayments: DemoPayment[] = demoInvoices
  .filter((invoice) => Number(invoice.amount_paid) > 0)
  .map((invoice, index) => ({
    id: `9a000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    branch_id: invoice.branch_id,
    invoice_id: invoice.id,
    student_id: invoice.student_id,
    amount: invoice.amount_paid,
    payment_method: METHODS[index % METHODS.length]!,
    transaction_reference: index % 2 === 0 ? `UPI${String(84210000 + index * 13)}` : null,
    payment_date: invoice.invoice_date,
    status: 'COMPLETED',
    reverses_payment_id: null,
    notes: null,
    recorded_by: DEMO_USER_ID,
    created_at: `${invoice.invoice_date}T10:32:00.000Z`,
    updated_at: TS,
    student_name: invoice.student_name,
    student_code: invoice.student_code,
    invoice_number: invoice.invoice_number,
    recorded_by_name: 'Demo Super Admin',
  }));

/* ------------------------------------------------------------ attendance */

export interface DemoRosterRow {
  student_id: string;
  full_name: string;
  student_code: string;
  mobile: string;
  branch_id: string;
  attendance_id: string | null;
  attendance_status: string | null;
  source: string | null;
  check_in_time: string | null;
  check_out_time: string | null;
  batch_id: string | null;
  batch_name: string | null;
}

export const demoRoster: DemoRosterRow[] = activeStudents.map((student, index) => {
  const marked = index % 4 !== 3;
  const batch = demoBatches[index % 3]!;

  return {
    student_id: student.id,
    full_name: student.full_name,
    student_code: student.student_code,
    mobile: student.mobile,
    branch_id: student.branch_id,
    attendance_id: marked ? `a77e0000-${index}` : null,
    attendance_status: marked ? (index % 5 === 1 ? 'LATE' : 'PRESENT') : null,
    source: marked ? (index % 3 === 0 ? 'BIOMETRIC' : 'MANUAL') : null,
    check_in_time: marked ? `${TODAY}T0${6 + (index % 3)}:${index % 2 ? '15' : '42'}:00.000Z` : null,
    check_out_time: marked && index % 3 === 0 ? `${TODAY}T13:05:00.000Z` : null,
    batch_id: batch.id,
    batch_name: batch.name,
  };
});

export interface DemoAttendance extends Attendance {
  student_name: string;
  student_code: string;
  student_mobile: string;
  batch_name: string | null;
}

export const demoAttendanceHistory: DemoAttendance[] = Array.from({ length: 40 }, (_, index) => {
  const student = activeStudents[index % activeStudents.length]!;
  const batch = demoBatches[index % 3]!;
  const day = shiftDays(TODAY, -Math.floor(index / 3));

  return {
    id: `a77e1111-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    branch_id: student.branch_id,
    student_id: student.id,
    batch_id: batch.id,
    attendance_date: day,
    check_in_time: `${day}T0${6 + (index % 3)}:30:00.000Z`,
    check_out_time: index % 4 === 0 ? `${day}T13:00:00.000Z` : null,
    status: index % 7 === 5 ? 'LATE' : 'PRESENT',
    source: index % 3 === 0 ? 'BIOMETRIC' : 'MANUAL',
    device_id: null,
    biometric_record_id: null,
    notes: null,
    recorded_by: DEMO_USER_ID,
    created_at: `${day}T06:31:00.000Z`,
    updated_at: TS,
    student_name: student.full_name,
    student_code: student.student_code,
    student_mobile: student.mobile,
    batch_name: batch.name,
  };
});

/* ------------------------------------------------------------------ fees */

export interface DemoFeeRow {
  id: string;
  branch_id: string;
  student_id: string;
  invoice_id: string | null;
  amount: string;
  due_date: string;
  status: string;
  student_name: string;
  student_code: string;
  student_mobile: string;
  invoice_number: string | null;
  invoice_balance: string | null;
}

export const demoFees: DemoFeeRow[] = demoInvoices.map((invoice, index) => {
  const balance = Number(invoice.balance);
  const status =
    balance <= 0
      ? 'PAID'
      : invoice.due_date < TODAY
        ? 'OVERDUE'
        : invoice.due_date === TODAY
          ? 'DUE'
          : 'UPCOMING';

  return {
    id: `fee00000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    branch_id: invoice.branch_id,
    student_id: invoice.student_id,
    invoice_id: invoice.id,
    amount: invoice.total,
    due_date: invoice.due_date,
    status,
    student_name: invoice.student_name,
    student_code: invoice.student_code,
    student_mobile:
      demoStudents.find((student) => student.id === invoice.student_id)?.mobile ?? '',
    invoice_number: invoice.invoice_number,
    invoice_balance: invoice.balance,
  };
});

/* ------------------------------------------------------------- aggregates */

const sum = (values: string[]) =>
  money(values.reduce((total, value) => total + Number(value), 0));

export const demoTotals = {
  collected: sum(demoPayments.map((payment) => payment.amount)),
  outstanding: sum(demoInvoices.map((invoice) => invoice.balance)),
  overdue: sum(
    demoInvoices.filter((invoice) => invoice.status === 'OVERDUE').map((i) => i.balance),
  ),
};

export const demoUsers: AppUser[] = [
  demoUser,
  {
    id: '00000000-0000-4000-8000-000000000002',
    email: 'branch.admin@manaslibrary.local',
    full_name: 'Kavita Singh',
    phone: '9999900010',
    role: 'BRANCH_ADMIN',
    status: 'ACTIVE',
    created_at: TS,
    updated_at: TS,
    branch_ids: [MAIN],
  },
  {
    id: '00000000-0000-4000-8000-000000000003',
    email: 'staff@manaslibrary.local',
    full_name: 'Ravi Kumar',
    phone: '9999900011',
    role: 'STAFF',
    status: 'ACTIVE',
    created_at: TS,
    updated_at: TS,
    branch_ids: [MAIN],
  },
  {
    id: '00000000-0000-4000-8000-000000000004',
    email: 'former.staff@manaslibrary.local',
    full_name: 'Sunil Das',
    phone: '9999900012',
    role: 'STAFF',
    status: 'INACTIVE',
    created_at: TS,
    updated_at: TS,
    branch_ids: [SECOND],
  },
];
