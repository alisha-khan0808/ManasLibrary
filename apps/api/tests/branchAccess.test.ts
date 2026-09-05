import { describe, expect, it } from 'vitest';
import { UserRole, canAssignRole, hasPermission, Permission, type AuthContext } from '@manas/shared';
import {
  authorizedBranchIds,
  canAccessBranch,
  resolveRequestedBranch,
} from '../src/domain/branchAccess';

const BRANCH_A = '11111111-1111-4111-8111-111111111111';
const BRANCH_B = '22222222-2222-4222-8222-222222222222';

const superAdmin: AuthContext = {
  userId: 'u-super',
  email: 'super@manas.test',
  role: UserRole.SUPER_ADMIN,
  status: 'ACTIVE',
  branchIds: null,
};

const branchAdminA: AuthContext = {
  userId: 'u-admin-a',
  email: 'admin.a@manas.test',
  role: UserRole.BRANCH_ADMIN,
  status: 'ACTIVE',
  branchIds: [BRANCH_A],
};

const multiBranchAdmin: AuthContext = {
  userId: 'u-admin-ab',
  email: 'admin.ab@manas.test',
  role: UserRole.BRANCH_ADMIN,
  status: 'ACTIVE',
  branchIds: [BRANCH_A, BRANCH_B],
};

const unassignedStaff: AuthContext = {
  userId: 'u-staff',
  email: 'staff@manas.test',
  role: UserRole.STAFF,
  status: 'ACTIVE',
  branchIds: [],
};

describe('canAccessBranch — the PRD §47 isolation rule', () => {
  it('lets a Super Admin reach any branch', () => {
    expect(canAccessBranch(superAdmin, BRANCH_A)).toBe(true);
    expect(canAccessBranch(superAdmin, BRANCH_B)).toBe(true);
  });

  it('confines a Branch Admin to their own branch', () => {
    expect(canAccessBranch(branchAdminA, BRANCH_A)).toBe(true);
    expect(canAccessBranch(branchAdminA, BRANCH_B)).toBe(false);
  });

  it('denies a user with no branch assignment', () => {
    expect(canAccessBranch(unassignedStaff, BRANCH_A)).toBe(false);
  });

  it('denies an inactive account even for its own branch', () => {
    expect(canAccessBranch({ ...branchAdminA, status: 'SUSPENDED' }, BRANCH_A)).toBe(false);
    expect(canAccessBranch({ ...superAdmin, status: 'INACTIVE' }, BRANCH_A)).toBe(false);
  });

  it('denies an empty or malformed branch id', () => {
    expect(canAccessBranch(branchAdminA, '')).toBe(false);
  });
});

describe('authorizedBranchIds', () => {
  it('returns null for a Super Admin, meaning "no filter"', () => {
    expect(authorizedBranchIds(superAdmin)).toBeNull();
  });

  it('returns the explicit list for everyone else', () => {
    expect(authorizedBranchIds(branchAdminA)).toEqual([BRANCH_A]);
    expect(authorizedBranchIds(unassignedStaff)).toEqual([]);
  });
});

describe('resolveRequestedBranch', () => {
  it('honours an authorised requested branch', () => {
    expect(resolveRequestedBranch(branchAdminA, BRANCH_A)).toEqual({
      kind: 'branch',
      branchId: BRANCH_A,
    });
  });

  it('denies a branch the caller cannot access, even though it exists', () => {
    expect(resolveRequestedBranch(branchAdminA, BRANCH_B)).toEqual({ kind: 'denied' });
  });

  it('falls back to the only branch a single-branch user has', () => {
    expect(resolveRequestedBranch(branchAdminA, undefined)).toEqual({
      kind: 'branch',
      branchId: BRANCH_A,
    });
  });

  it('refuses to guess for a multi-branch user on a write', () => {
    expect(resolveRequestedBranch(multiBranchAdmin, undefined)).toEqual({ kind: 'ambiguous' });
  });

  it('allows "all branches" for reads when asked to', () => {
    expect(resolveRequestedBranch(multiBranchAdmin, undefined, { allowAll: true })).toEqual({
      kind: 'all',
    });
    expect(resolveRequestedBranch(superAdmin, undefined, { allowAll: true })).toEqual({
      kind: 'all',
    });
  });

  it('reports a Super Admin without a branch as ambiguous on a write', () => {
    expect(resolveRequestedBranch(superAdmin, undefined)).toEqual({ kind: 'ambiguous' });
  });

  it('reports an unassigned user as having no branch', () => {
    expect(resolveRequestedBranch(unassignedStaff, undefined)).toEqual({ kind: 'none' });
  });

  it('denies an inactive account outright', () => {
    expect(resolveRequestedBranch({ ...branchAdminA, status: 'INACTIVE' }, BRANCH_A)).toEqual({
      kind: 'denied',
    });
  });
});

describe('role permissions', () => {
  it('gives staff operational permissions but not configuration ones', () => {
    expect(hasPermission(UserRole.STAFF, Permission.PAYMENT_RECORD)).toBe(true);
    expect(hasPermission(UserRole.STAFF, Permission.SEAT_ALLOCATE)).toBe(true);
    expect(hasPermission(UserRole.STAFF, Permission.SEAT_MANAGE)).toBe(false);
    expect(hasPermission(UserRole.STAFF, Permission.BRANCH_MANAGE)).toBe(false);
    expect(hasPermission(UserRole.STAFF, Permission.PAYMENT_REVERSE)).toBe(false);
  });

  it('withholds branch and plan management from a Branch Admin', () => {
    expect(hasPermission(UserRole.BRANCH_ADMIN, Permission.BRANCH_MANAGE)).toBe(false);
    expect(hasPermission(UserRole.BRANCH_ADMIN, Permission.MEMBERSHIP_PLAN_MANAGE)).toBe(false);
    expect(hasPermission(UserRole.BRANCH_ADMIN, Permission.USER_MANAGE)).toBe(true);
  });

  it('stops a Branch Admin from minting a Super Admin', () => {
    expect(canAssignRole(UserRole.BRANCH_ADMIN, UserRole.SUPER_ADMIN)).toBe(false);
    expect(canAssignRole(UserRole.BRANCH_ADMIN, UserRole.STAFF)).toBe(true);
    expect(canAssignRole(UserRole.SUPER_ADMIN, UserRole.SUPER_ADMIN)).toBe(true);
    expect(canAssignRole(UserRole.STAFF, UserRole.STAFF)).toBe(false);
  });
});
