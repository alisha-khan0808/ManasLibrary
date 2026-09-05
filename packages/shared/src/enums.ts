/**
 * Domain enumerations. These mirror the PostgreSQL enum types declared in
 * database/migrations — keep both sides in sync when adding a value.
 */

export const UserRole = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  BRANCH_ADMIN: 'BRANCH_ADMIN',
  STAFF: 'STAFF',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const UserStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  SUSPENDED: 'SUSPENDED',
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const BranchStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  SUSPENDED: 'SUSPENDED',
} as const;
export type BranchStatus = (typeof BranchStatus)[keyof typeof BranchStatus];

export const StudentStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  EXPIRED: 'EXPIRED',
  SUSPENDED: 'SUSPENDED',
} as const;
export type StudentStatus = (typeof StudentStatus)[keyof typeof StudentStatus];

export const MembershipPlanStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
} as const;
export type MembershipPlanStatus =
  (typeof MembershipPlanStatus)[keyof typeof MembershipPlanStatus];

export const SeatStatus = {
  AVAILABLE: 'AVAILABLE',
  OCCUPIED: 'OCCUPIED',
  RESERVED: 'RESERVED',
  MAINTENANCE: 'MAINTENANCE',
  INACTIVE: 'INACTIVE',
} as const;
export type SeatStatus = (typeof SeatStatus)[keyof typeof SeatStatus];

export const SeatType = {
  STANDARD: 'STANDARD',
  CABIN: 'CABIN',
  AC: 'AC',
  NON_AC: 'NON_AC',
} as const;
export type SeatType = (typeof SeatType)[keyof typeof SeatType];

export const SeatAllocationStatus = {
  ACTIVE: 'ACTIVE',
  RELEASED: 'RELEASED',
  TRANSFERRED: 'TRANSFERRED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
} as const;
export type SeatAllocationStatus =
  (typeof SeatAllocationStatus)[keyof typeof SeatAllocationStatus];

export const BatchStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
} as const;
export type BatchStatus = (typeof BatchStatus)[keyof typeof BatchStatus];

export const BatchEnrollmentStatus = {
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  TRANSFERRED: 'TRANSFERRED',
  CANCELLED: 'CANCELLED',
} as const;
export type BatchEnrollmentStatus =
  (typeof BatchEnrollmentStatus)[keyof typeof BatchEnrollmentStatus];

export const AdmissionStatus = {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
} as const;
export type AdmissionStatus =
  (typeof AdmissionStatus)[keyof typeof AdmissionStatus];

export const InvoiceStatus = {
  DRAFT: 'DRAFT',
  PENDING: 'PENDING',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  PAID: 'PAID',
  OVERDUE: 'OVERDUE',
  CANCELLED: 'CANCELLED',
} as const;
export type InvoiceStatus = (typeof InvoiceStatus)[keyof typeof InvoiceStatus];

export const PaymentMethod = {
  CASH: 'CASH',
  UPI: 'UPI',
  BANK_TRANSFER: 'BANK_TRANSFER',
  CARD: 'CARD',
  OTHER: 'OTHER',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const PaymentStatus = {
  COMPLETED: 'COMPLETED',
  REVERSED: 'REVERSED',
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const FeeScheduleStatus = {
  UPCOMING: 'UPCOMING',
  DUE: 'DUE',
  PAID: 'PAID',
  OVERDUE: 'OVERDUE',
  CANCELLED: 'CANCELLED',
} as const;
export type FeeScheduleStatus =
  (typeof FeeScheduleStatus)[keyof typeof FeeScheduleStatus];

export const FeeReminderType = {
  UPCOMING: 'UPCOMING',
  DUE_TODAY: 'DUE_TODAY',
  OVERDUE: 'OVERDUE',
} as const;
export type FeeReminderType =
  (typeof FeeReminderType)[keyof typeof FeeReminderType];

export const FeeReminderStatus = {
  PENDING: 'PENDING',
  SENT: 'SENT',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED',
} as const;
export type FeeReminderStatus =
  (typeof FeeReminderStatus)[keyof typeof FeeReminderStatus];

export const AttendanceSource = {
  MANUAL: 'MANUAL',
  BIOMETRIC: 'BIOMETRIC',
  IMPORTED: 'IMPORTED',
} as const;
export type AttendanceSource =
  (typeof AttendanceSource)[keyof typeof AttendanceSource];

export const AttendanceStatus = {
  PRESENT: 'PRESENT',
  ABSENT: 'ABSENT',
  LATE: 'LATE',
} as const;
export type AttendanceStatus =
  (typeof AttendanceStatus)[keyof typeof AttendanceStatus];

export const DeviceStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  ERROR: 'ERROR',
} as const;
export type DeviceStatus = (typeof DeviceStatus)[keyof typeof DeviceStatus];

export const AuditAction = {
  BRANCH_CREATED: 'BRANCH_CREATED',
  BRANCH_UPDATED: 'BRANCH_UPDATED',
  STUDENT_CREATED: 'STUDENT_CREATED',
  STUDENT_UPDATED: 'STUDENT_UPDATED',
  ADMISSION_CREATED: 'ADMISSION_CREATED',
  ADMISSION_CANCELLED: 'ADMISSION_CANCELLED',
  SEAT_ALLOCATED: 'SEAT_ALLOCATED',
  SEAT_TRANSFERRED: 'SEAT_TRANSFERRED',
  SEAT_RELEASED: 'SEAT_RELEASED',
  INVOICE_CREATED: 'INVOICE_CREATED',
  INVOICE_CANCELLED: 'INVOICE_CANCELLED',
  PAYMENT_RECORDED: 'PAYMENT_RECORDED',
  PAYMENT_REVERSED: 'PAYMENT_REVERSED',
  ATTENDANCE_CREATED: 'ATTENDANCE_CREATED',
  ATTENDANCE_UPDATED: 'ATTENDANCE_UPDATED',
  BATCH_ENROLLED: 'BATCH_ENROLLED',
  BATCH_TRANSFERRED: 'BATCH_TRANSFERRED',
  USER_CREATED: 'USER_CREATED',
  USER_UPDATED: 'USER_UPDATED',
  BIOMETRIC_SYNCED: 'BIOMETRIC_SYNCED',
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

/** Machine-readable error codes returned in the API error envelope. */
export const ErrorCode = {
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  BRANCH_ACCESS_DENIED: 'BRANCH_ACCESS_DENIED',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  BRANCH_INACTIVE: 'BRANCH_INACTIVE',
  SEAT_ALREADY_ALLOCATED: 'SEAT_ALREADY_ALLOCATED',
  SEAT_NOT_AVAILABLE: 'SEAT_NOT_AVAILABLE',
  SEAT_ALLOCATION_NOT_ACTIVE: 'SEAT_ALLOCATION_NOT_ACTIVE',
  BATCH_CAPACITY_EXCEEDED: 'BATCH_CAPACITY_EXCEEDED',
  BATCH_INACTIVE: 'BATCH_INACTIVE',
  STUDENT_ALREADY_ENROLLED: 'STUDENT_ALREADY_ENROLLED',
  INVOICE_CANCELLED: 'INVOICE_CANCELLED',
  INVOICE_ALREADY_PAID: 'INVOICE_ALREADY_PAID',
  OVERPAYMENT_NOT_ALLOWED: 'OVERPAYMENT_NOT_ALLOWED',
  PAYMENT_ALREADY_REVERSED: 'PAYMENT_ALREADY_REVERSED',
  DUPLICATE_ATTENDANCE: 'DUPLICATE_ATTENDANCE',
  BIOMETRIC_NOT_CONFIGURED: 'BIOMETRIC_NOT_CONFIGURED',
  BIOMETRIC_MAPPING_MISMATCH: 'BIOMETRIC_MAPPING_MISMATCH',
  MEMBERSHIP_PLAN_INACTIVE: 'MEMBERSHIP_PLAN_INACTIVE',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
