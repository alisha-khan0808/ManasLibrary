import { UserRole } from './enums';

/**
 * Permission catalogue (PRD §5). The API is the authority — every route
 * declares the permission it requires and the frontend uses the same map to
 * decide what to render. Never rely on the frontend check alone.
 */
export const Permission = {
  BRANCH_MANAGE: 'branch:manage',
  BRANCH_VIEW_ALL: 'branch:view-all',
  USER_MANAGE: 'user:manage',
  MEMBERSHIP_PLAN_MANAGE: 'membership-plan:manage',
  SETTINGS_MANAGE: 'settings:manage',

  STUDENT_MANAGE: 'student:manage',
  STUDENT_VIEW: 'student:view',
  ADMISSION_MANAGE: 'admission:manage',
  SEAT_MANAGE: 'seat:manage',
  SEAT_ALLOCATE: 'seat:allocate',
  BATCH_MANAGE: 'batch:manage',
  ATTENDANCE_MANAGE: 'attendance:manage',
  INVOICE_MANAGE: 'invoice:manage',
  INVOICE_VIEW: 'invoice:view',
  PAYMENT_RECORD: 'payment:record',
  PAYMENT_REVERSE: 'payment:reverse',
  FEE_MANAGE: 'fee:manage',
  REPORT_VIEW: 'report:view',
  BIOMETRIC_MANAGE: 'biometric:manage',
  AUDIT_VIEW: 'audit:view',
} as const;
export type Permission = (typeof Permission)[keyof typeof Permission];

const STAFF_PERMISSIONS: Permission[] = [
  Permission.STUDENT_VIEW,
  Permission.STUDENT_MANAGE,
  Permission.ADMISSION_MANAGE,
  Permission.SEAT_ALLOCATE,
  Permission.ATTENDANCE_MANAGE,
  Permission.INVOICE_VIEW,
  Permission.PAYMENT_RECORD,
];

const BRANCH_ADMIN_PERMISSIONS: Permission[] = [
  ...STAFF_PERMISSIONS,
  Permission.SEAT_MANAGE,
  Permission.BATCH_MANAGE,
  Permission.INVOICE_MANAGE,
  Permission.PAYMENT_REVERSE,
  Permission.FEE_MANAGE,
  Permission.REPORT_VIEW,
  Permission.USER_MANAGE,
  Permission.BIOMETRIC_MANAGE,
  Permission.AUDIT_VIEW,
];

const SUPER_ADMIN_PERMISSIONS: Permission[] = [
  ...BRANCH_ADMIN_PERMISSIONS,
  Permission.BRANCH_MANAGE,
  Permission.BRANCH_VIEW_ALL,
  Permission.MEMBERSHIP_PLAN_MANAGE,
  Permission.SETTINGS_MANAGE,
];

export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  [UserRole.SUPER_ADMIN]: SUPER_ADMIN_PERMISSIONS,
  [UserRole.BRANCH_ADMIN]: BRANCH_ADMIN_PERMISSIONS,
  [UserRole.STAFF]: STAFF_PERMISSIONS,
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/**
 * A Branch Admin may manage users only inside their own branch, and may never
 * create a Super Admin. Encoded here so the API and UI agree.
 */
export function canAssignRole(actor: UserRole, target: UserRole): boolean {
  if (actor === UserRole.SUPER_ADMIN) return true;
  if (actor === UserRole.BRANCH_ADMIN) {
    return target === UserRole.STAFF || target === UserRole.BRANCH_ADMIN;
  }
  return false;
}
