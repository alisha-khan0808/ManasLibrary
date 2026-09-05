import { ErrorCode } from '@manas/shared';

export interface ErrorDetail {
  path: string;
  message: string;
}

/**
 * The only error type that is allowed to reach the client verbatim. Anything
 * else is reported as INTERNAL_ERROR with a generic message (PRD §32).
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode | string;
  readonly details?: ErrorDetail[];
  readonly expose = true;

  constructor(
    statusCode: number,
    code: ErrorCode | string,
    message: string,
    details?: ErrorDetail[],
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace?.(this, AppError);
  }
}

export const unauthenticated = (message = 'Authentication is required.') =>
  new AppError(401, ErrorCode.UNAUTHENTICATED, message);

export const forbidden = (message = 'You do not have permission to perform this action.') =>
  new AppError(403, ErrorCode.FORBIDDEN, message);

export const branchAccessDenied = (
  message = 'You are not authorized to access this branch.',
) => new AppError(403, ErrorCode.BRANCH_ACCESS_DENIED, message);

export const notFound = (entity = 'Resource') =>
  new AppError(404, ErrorCode.NOT_FOUND, `${entity} was not found.`);

export const validationError = (message: string, details?: ErrorDetail[]) =>
  new AppError(400, ErrorCode.VALIDATION_ERROR, message, details);

export const conflict = (code: ErrorCode | string, message: string) =>
  new AppError(409, code, message);

export const badRequest = (code: ErrorCode | string, message: string) =>
  new AppError(400, code, message);

/** Postgres error codes we translate into meaningful client errors. */
export const PG_ERROR = {
  UNIQUE_VIOLATION: '23505',
  FOREIGN_KEY_VIOLATION: '23503',
  CHECK_VIOLATION: '23514',
  EXCLUSION_VIOLATION: '23P01',
  NOT_NULL_VIOLATION: '23502',
} as const;

interface PgLikeError {
  code?: string;
  constraint?: string;
  message?: string;
}

export function isPgError(error: unknown): error is PgLikeError {
  return typeof error === 'object' && error !== null && 'code' in error;
}

/**
 * Maps database constraint violations onto the documented API error codes.
 * Constraint names are the contract here — renaming one in a migration must
 * be mirrored below.
 */
export function translateDatabaseError(error: unknown): AppError | null {
  if (!isPgError(error)) return null;

  const constraint = error.constraint ?? '';

  if (error.code === PG_ERROR.EXCLUSION_VIOLATION) {
    if (constraint === 'excl_seat_allocations_overlap') {
      return conflict(
        ErrorCode.SEAT_ALREADY_ALLOCATED,
        'The selected seat is already allocated for an overlapping period.',
      );
    }
    if (constraint === 'excl_student_allocations_overlap') {
      return conflict(
        ErrorCode.SEAT_ALREADY_ALLOCATED,
        'This student already holds a seat for an overlapping period.',
      );
    }
  }

  if (error.code === PG_ERROR.UNIQUE_VIOLATION) {
    switch (constraint) {
      case 'uq_students_branch_mobile':
        return conflict(
          ErrorCode.CONFLICT,
          'A student with this mobile number already exists in this branch.',
        );
      case 'students_student_code_key':
        return conflict(ErrorCode.CONFLICT, 'This student code is already in use.');
      case 'uq_attendance_student_day':
        return conflict(
          ErrorCode.DUPLICATE_ATTENDANCE,
          'Attendance has already been recorded for this student on this date.',
        );
      case 'uq_attendance_biometric_record':
        return conflict(
          ErrorCode.DUPLICATE_ATTENDANCE,
          'This biometric record has already been imported.',
        );
      case 'uq_batch_students_active':
        return conflict(
          ErrorCode.STUDENT_ALREADY_ENROLLED,
          'This student is already enrolled in an active batch.',
        );
      case 'uq_admissions_active_per_student':
        return conflict(
          ErrorCode.CONFLICT,
          'This student already has an open admission. Cancel or complete it first.',
        );
      case 'invoices_invoice_number_key':
        return conflict(ErrorCode.CONFLICT, 'This invoice number is already in use.');
      case 'admissions_admission_number_key':
        return conflict(ErrorCode.CONFLICT, 'This admission number is already in use.');
      case 'uq_seats_branch_number':
        return conflict(
          ErrorCode.CONFLICT,
          'A seat with this number already exists in this branch.',
        );
      case 'uq_batches_branch_name':
        return conflict(
          ErrorCode.CONFLICT,
          'A batch with this name already exists in this branch.',
        );
      case 'branches_branch_code_key':
        return conflict(ErrorCode.CONFLICT, 'This branch code is already in use.');
      case 'users_email_key':
        return conflict(ErrorCode.CONFLICT, 'A user with this email already exists.');
      case 'uq_biometric_mappings_device_user':
      case 'uq_biometric_mappings_device_student':
        return conflict(
          ErrorCode.CONFLICT,
          'This biometric user is already mapped on the selected device.',
        );
      default:
        return conflict(ErrorCode.CONFLICT, 'This record conflicts with an existing one.');
    }
  }

  if (error.code === PG_ERROR.CHECK_VIOLATION) {
    if (error.message?.includes('BATCH_CAPACITY_EXCEEDED')) {
      return conflict(
        ErrorCode.BATCH_CAPACITY_EXCEEDED,
        'The selected batch has reached its capacity.',
      );
    }
    if (constraint === 'invoices_no_overpayment') {
      return badRequest(
        ErrorCode.OVERPAYMENT_NOT_ALLOWED,
        'The payment amount exceeds the outstanding balance on this invoice.',
      );
    }
    return badRequest(
      ErrorCode.VALIDATION_ERROR,
      'The submitted values violate a business rule.',
    );
  }

  if (error.code === PG_ERROR.FOREIGN_KEY_VIOLATION) {
    // Composite (id, branch_id) foreign keys fail this way when a caller
    // mixes records from two different branches.
    if (constraint.startsWith('fk_') && constraint.includes('_')) {
      return new AppError(
        403,
        ErrorCode.BRANCH_ACCESS_DENIED,
        'The referenced record belongs to a different branch.',
      );
    }
    return badRequest(
      ErrorCode.VALIDATION_ERROR,
      'A referenced record does not exist or is still in use.',
    );
  }

  return null;
}
