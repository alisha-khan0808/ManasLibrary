import { UserRole, type AuthContext } from '@manas/shared';

/**
 * The single source of truth for "may this caller touch this branch?".
 *
 * Deliberately pure so it can be exhaustively unit-tested (PRD §47) and so
 * every code path — routes, jobs, reports — reaches the same verdict.
 */

export function authorizedBranchIds(auth: AuthContext): string[] | null {
  return auth.role === UserRole.SUPER_ADMIN ? null : (auth.branchIds ?? []);
}

export function canAccessBranch(auth: AuthContext, branchId: string): boolean {
  if (auth.status !== 'ACTIVE') return false;
  if (auth.role === UserRole.SUPER_ADMIN) return true;
  if (!branchId) return false;
  return (auth.branchIds ?? []).includes(branchId);
}

/**
 * Resolves the branch a request should operate on.
 *
 * - A branch supplied by the client is honoured only after an access check.
 * - When none is supplied, a single-branch user falls back to their branch;
 *   anyone with a choice must state it explicitly rather than have the server
 *   guess which branch they meant.
 */
export type BranchResolution =
  | { kind: 'branch'; branchId: string }
  | { kind: 'all' }
  | { kind: 'ambiguous' }
  | { kind: 'denied' }
  | { kind: 'none' };

export function resolveRequestedBranch(
  auth: AuthContext,
  requestedBranchId: string | undefined | null,
  options: { allowAll?: boolean } = {},
): BranchResolution {
  if (auth.status !== 'ACTIVE') return { kind: 'denied' };

  if (requestedBranchId) {
    return canAccessBranch(auth, requestedBranchId)
      ? { kind: 'branch', branchId: requestedBranchId }
      : { kind: 'denied' };
  }

  if (auth.role === UserRole.SUPER_ADMIN) {
    return options.allowAll ? { kind: 'all' } : { kind: 'ambiguous' };
  }

  const branches = auth.branchIds ?? [];
  if (branches.length === 0) return { kind: 'none' };
  if (branches.length === 1) return { kind: 'branch', branchId: branches[0]! };

  return options.allowAll ? { kind: 'all' } : { kind: 'ambiguous' };
}

/**
 * Builds the branch filter applied to every list/report query. Returning
 * `null` means "no filter" and is only ever produced for a Super Admin.
 */
export function branchFilterFor(auth: AuthContext): string[] | null {
  return authorizedBranchIds(auth);
}
