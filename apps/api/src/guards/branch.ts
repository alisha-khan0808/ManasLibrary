import { BranchStatus, type AuthContext } from '@manas/shared';
import { canAccessBranch, resolveRequestedBranch } from '../domain/branchAccess';
import { queryOne } from '../database/pool';
import type { Tx } from '../database/transaction';
import { AppError, badRequest, branchAccessDenied, notFound } from '../utils/errors';
import { ErrorCode } from '@manas/shared';

/**
 * Branch authorization (PRD §6).
 *
 * Every handler that touches branch-owned data resolves its branch through
 * this module. A branch id arriving from a URL, query string or body is never
 * trusted until it has been checked here.
 */

export function assertBranchAccess(auth: AuthContext, branchId: string): void {
  if (!canAccessBranch(auth, branchId)) {
    throw branchAccessDenied();
  }
}

/**
 * Resolves the branch for a write operation. A write must always name exactly
 * one branch, so "all branches" is not an acceptable answer here.
 */
export function requireBranchForWrite(
  auth: AuthContext,
  requestedBranchId: string | undefined | null,
): string {
  const resolution = resolveRequestedBranch(auth, requestedBranchId, { allowAll: false });

  switch (resolution.kind) {
    case 'branch':
      return resolution.branchId;
    case 'denied':
      throw branchAccessDenied();
    case 'none':
      throw new AppError(
        403,
        ErrorCode.BRANCH_ACCESS_DENIED,
        'Your account is not assigned to any branch.',
      );
    case 'ambiguous':
    case 'all':
      throw badRequest(
        ErrorCode.VALIDATION_ERROR,
        'branchId is required because your account can access more than one branch.',
      );
  }
}

/**
 * Resolves the branch scope for a read/list operation. `null` means "every
 * branch the caller may see" and is combined with a SQL filter by the caller.
 */
export function resolveBranchScope(
  auth: AuthContext,
  requestedBranchId: string | undefined | null,
): { branchId: string | null; allowedBranchIds: string[] | null } {
  const resolution = resolveRequestedBranch(auth, requestedBranchId, { allowAll: true });

  switch (resolution.kind) {
    case 'branch':
      return { branchId: resolution.branchId, allowedBranchIds: [resolution.branchId] };
    case 'all':
      return { branchId: null, allowedBranchIds: auth.branchIds };
    case 'none':
      return { branchId: null, allowedBranchIds: [] };
    case 'denied':
      throw branchAccessDenied();
    case 'ambiguous':
      // Cannot occur with allowAll: true, but keeps the switch exhaustive.
      throw badRequest(ErrorCode.VALIDATION_ERROR, 'branchId is required.');
  }
}

interface BranchRow {
  id: string;
  status: BranchStatus;
  branch_code: string;
  name: string;
}

/**
 * Loads a branch and refuses operational writes against a branch that is not
 * ACTIVE (PRD §8): an inactive branch accepts no new admissions or
 * transactions.
 */
export async function assertBranchOperable(
  branchId: string,
  db?: Tx,
): Promise<BranchRow> {
  const sql = 'SELECT id, status, branch_code::text AS branch_code, name FROM public.branches WHERE id = $1';

  const branch = db
    ? await db.queryOne<BranchRow>(sql, [branchId])
    : await queryOne<BranchRow>(sql, [branchId]);

  if (!branch) {
    throw notFound('Branch');
  }

  if (branch.status !== BranchStatus.ACTIVE) {
    throw new AppError(
      409,
      ErrorCode.BRANCH_INACTIVE,
      `Branch ${branch.name} is ${branch.status.toLowerCase()} and cannot accept new transactions.`,
    );
  }

  return branch;
}

/**
 * Builds a `branch_id` SQL predicate for list queries.
 *
 * Returns a fragment plus the parameters to append. When the caller is a Super
 * Admin viewing everything the fragment is `TRUE`, which keeps call sites free
 * of conditional SQL assembly.
 */
export function branchPredicate(
  allowedBranchIds: string[] | null,
  column: string,
  paramIndex: number,
): { sql: string; params: unknown[]; nextIndex: number } {
  if (allowedBranchIds === null) {
    return { sql: 'TRUE', params: [], nextIndex: paramIndex };
  }

  if (allowedBranchIds.length === 0) {
    // Assigned to no branch: match nothing rather than everything.
    return { sql: 'FALSE', params: [], nextIndex: paramIndex };
  }

  return {
    sql: `${column} = ANY($${paramIndex}::uuid[])`,
    params: [allowedBranchIds],
    nextIndex: paramIndex + 1,
  };
}
