import type {
  AdmissionStatus,
  AttendanceSource,
  AttendanceStatus,
  BatchEnrollmentStatus,
  BatchStatus,
  BranchStatus,
  DeviceStatus,
  ErrorCode,
  FeeReminderStatus,
  FeeReminderType,
  FeeScheduleStatus,
  InvoiceStatus,
  MembershipPlanStatus,
  PaymentMethod,
  PaymentStatus,
  SeatAllocationStatus,
  SeatStatus,
  SeatType,
  StudentStatus,
  UserRole,
  UserStatus,
} from './enums';

/* -------------------------------------------------------------------------
 * API envelope (PRD §32)
 * ---------------------------------------------------------------------- */

export interface ApiSuccess<T> {
  success: true;
  data: T;
  message: string;
  meta?: PaginationMeta;
}

export interface ApiError {
  success: false;
  error: {
    code: ErrorCode | string;
    message: string;
    /** Field-level detail, only present for validation failures. */
    details?: Array<{ path: string; message: string }>;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PaginatedQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

/* -------------------------------------------------------------------------
 * Entities
 * ---------------------------------------------------------------------- */

export interface Branch {
  id: string;
  branch_code: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  email: string | null;
  opening_time: string | null;
  closing_time: string | null;
  status: BranchStatus;
  created_at: string;
  updated_at: string;
}

export interface AppUser {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  role: UserRole;
  status: UserStatus;
  created_at: string;
  updated_at: string;
  /** Branches this user may operate on. Empty for SUPER_ADMIN (implicitly all). */
  branch_ids: string[];
}

/** The caller identity resolved on every authenticated request. */
export interface AuthContext {
  userId: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  /** null means "all branches" (SUPER_ADMIN). */
  branchIds: string[] | null;
}

export interface Student {
  id: string;
  student_code: string;
  branch_id: string;
  full_name: string;
  mobile: string;
  email: string | null;
  date_of_birth: string | null;
  address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  photo_url: string | null;
  status: StudentStatus;
  created_at: string;
  updated_at: string;
}

export interface MembershipPlan {
  id: string;
  name: string;
  duration_days: number;
  price: string;
  description: string | null;
  status: MembershipPlanStatus;
  created_at: string;
  updated_at: string;
}

export interface Seat {
  id: string;
  branch_id: string;
  seat_number: string;
  floor: string | null;
  section: string | null;
  seat_type: SeatType;
  status: SeatStatus;
  created_at: string;
  updated_at: string;
}

export interface SeatAllocation {
  id: string;
  branch_id: string;
  seat_id: string;
  student_id: string;
  start_date: string;
  end_date: string | null;
  status: SeatAllocationStatus;
  allocated_by: string | null;
  released_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Batch {
  id: string;
  branch_id: string;
  name: string;
  start_time: string;
  end_time: string;
  capacity: number;
  status: BatchStatus;
  created_at: string;
  updated_at: string;
}

export interface BatchStudent {
  id: string;
  branch_id: string;
  batch_id: string;
  student_id: string;
  start_date: string;
  end_date: string | null;
  status: BatchEnrollmentStatus;
  created_at: string;
  updated_at: string;
}

export interface Admission {
  id: string;
  admission_number: string;
  branch_id: string;
  student_id: string;
  membership_plan_id: string;
  batch_id: string | null;
  seat_id: string | null;
  admission_date: string;
  start_date: string;
  end_date: string;
  status: AdmissionStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price: string;
  amount: string;
  created_at: string;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  branch_id: string;
  student_id: string;
  admission_id: string | null;
  invoice_date: string;
  due_date: string;
  subtotal: string;
  discount: string;
  tax: string;
  total: string;
  amount_paid: string;
  balance: string;
  status: InvoiceStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  branch_id: string;
  invoice_id: string;
  student_id: string;
  amount: string;
  payment_method: PaymentMethod;
  transaction_reference: string | null;
  payment_date: string;
  status: PaymentStatus;
  /** Set on a compensating row; points at the payment being undone. */
  reverses_payment_id: string | null;
  notes: string | null;
  recorded_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface FeeSchedule {
  id: string;
  branch_id: string;
  student_id: string;
  invoice_id: string | null;
  amount: string;
  due_date: string;
  status: FeeScheduleStatus;
  created_at: string;
  updated_at: string;
}

export interface FeeReminder {
  id: string;
  branch_id: string;
  student_id: string;
  fee_schedule_id: string;
  reminder_type: FeeReminderType;
  reminder_date: string;
  status: FeeReminderStatus;
  provider: string | null;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Attendance {
  id: string;
  branch_id: string;
  student_id: string;
  batch_id: string | null;
  attendance_date: string;
  check_in_time: string | null;
  check_out_time: string | null;
  status: AttendanceStatus;
  source: AttendanceSource;
  device_id: string | null;
  biometric_record_id: string | null;
  notes: string | null;
  recorded_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BiometricDevice {
  id: string;
  branch_id: string;
  name: string;
  device_identifier: string;
  ip_address: string | null;
  api_endpoint: string | null;
  status: DeviceStatus;
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BiometricMapping {
  id: string;
  branch_id: string;
  device_id: string;
  biometric_user_id: string;
  student_id: string;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  branch_id: string | null;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

/* -------------------------------------------------------------------------
 * Composite read models
 * ---------------------------------------------------------------------- */

export interface StudentProfile {
  student: Student;
  branch: Pick<Branch, 'id' | 'name' | 'branch_code'>;
  currentAdmission: Admission | null;
  membershipPlan: MembershipPlan | null;
  currentSeat: Seat | null;
  currentBatch: Batch | null;
  feeSummary: {
    totalInvoiced: string;
    totalPaid: string;
    outstanding: string;
    overdueCount: number;
    nextDueDate: string | null;
  };
  recentInvoices: Invoice[];
  recentPayments: Payment[];
  recentAttendance: Attendance[];
}

export interface BranchDashboard {
  branchId: string | null;
  activeStudents: number;
  totalSeats: number;
  availableSeats: number;
  occupiedSeats: number;
  todayAttendance: number;
  todayAdmissions: number;
  todayCollection: string;
  pendingFees: string;
  overdueFees: string;
  upcomingRenewals: number;
}

export interface SuperAdminDashboard extends BranchDashboard {
  totalBranches: number;
  activeBranches: number;
  revenue: string;
  branchBreakdown: Array<{
    branchId: string;
    branchName: string;
    activeStudents: number;
    occupiedSeats: number;
    todayCollection: string;
    outstanding: string;
  }>;
}

export interface SearchResult {
  type: 'student' | 'seat' | 'invoice' | 'admission' | 'batch';
  id: string;
  branchId: string;
  label: string;
  sublabel: string;
  href: string;
}
