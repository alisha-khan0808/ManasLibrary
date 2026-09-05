import {
  AuditAction,
  ErrorCode,
  UserRole,
  canAssignRole,
  type AppUser,
  type AuthContext,
} from '@manas/shared';
import { query, queryOne } from '../../database/pool';
import { withTransaction } from '../../database/transaction';
import { assertBranchAccess } from '../../guards/branch';
import { branchFilterFor } from '../../domain/branchAccess';
import { invalidateProfileCache } from '../../middleware/auth';
import { recordAudit } from '../../services/audit';
import { supabaseAdmin } from '../../services/supabaseAdmin';
import { AppError, badRequest, forbidden, notFound } from '../../utils/errors';
import { buildPaginationMeta } from '../../utils/response';
import { logger } from '../../utils/logger';
import type { CreateUserInput, UpdateUserInput } from './users.schema';

const SELECT_COLUMNS = `
  u.id,
  u.email::text AS email,
  u.full_name,
  u.phone,
  u.role,
  u.status,
  u.created_at,
  u.updated_at,
  coalesce(
    array_agg(ub.branch_id) FILTER (WHERE ub.branch_id IS NOT NULL),
    '{}'
  ) AS branch_ids
`;

/**
 * A Branch Admin may only see and manage users who share at least one of their
 * branches, and may never see a Super Admin.
 */
function visibilityConditions(auth: AuthContext, startIndex: number) {
  const allowed = branchFilterFor(auth);

  if (allowed === null) {
    return { sql: 'TRUE', params: [] as unknown[], nextIndex: startIndex };
  }

  if (allowed.length === 0) {
    return { sql: 'FALSE', params: [] as unknown[], nextIndex: startIndex };
  }

  return {
    sql: `(u.role <> 'SUPER_ADMIN' AND EXISTS (
            SELECT 1 FROM public.user_branches x
             WHERE x.user_id = u.id AND x.branch_id = ANY($${startIndex}::uuid[])
          ))`,
    params: [allowed] as unknown[],
    nextIndex: startIndex + 1,
  };
}

export async function listUsers(
  auth: AuthContext,
  params: {
    page: number;
    pageSize: number;
    search?: string;
    role?: string;
    status?: string;
    branchId?: string;
  },
) {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let index = 1;

  const visibility = visibilityConditions(auth, index);
  conditions.push(visibility.sql);
  values.push(...visibility.params);
  index = visibility.nextIndex;

  if (params.branchId) {
    assertBranchAccess(auth, params.branchId);
    conditions.push(
      `EXISTS (SELECT 1 FROM public.user_branches f WHERE f.user_id = u.id AND f.branch_id = $${index})`,
    );
    values.push(params.branchId);
    index += 1;
  }

  if (params.search) {
    conditions.push(`(u.full_name ILIKE $${index} OR u.email::text ILIKE $${index})`);
    values.push(`%${params.search}%`);
    index += 1;
  }

  if (params.role) {
    conditions.push(`u.role = $${index}::user_role`);
    values.push(params.role);
    index += 1;
  }

  if (params.status) {
    conditions.push(`u.status = $${index}::user_status`);
    values.push(params.status);
    index += 1;
  }

  const where = `WHERE ${conditions.join(' AND ')}`;
  const offset = (params.page - 1) * params.pageSize;

  const rows = await query<AppUser>(
    `SELECT ${SELECT_COLUMNS}
       FROM public.users u
       LEFT JOIN public.user_branches ub ON ub.user_id = u.id
       ${where}
      GROUP BY u.id
      ORDER BY u.full_name ASC
      LIMIT $${index} OFFSET $${index + 1}`,
    [...values, params.pageSize, offset],
  );

  const countRow = await queryOne<{ count: number }>(
    `SELECT count(*)::bigint AS count FROM public.users u ${where}`,
    values,
  );

  return {
    data: rows,
    meta: buildPaginationMeta(params.page, params.pageSize, countRow?.count ?? 0),
  };
}

export async function getUser(auth: AuthContext, userId: string): Promise<AppUser> {
  // $1 is the target user; visibility parameters start at $2.
  const visibility = visibilityConditions(auth, 2);

  const user = await queryOne<AppUser>(
    `SELECT ${SELECT_COLUMNS}
       FROM public.users u
       LEFT JOIN public.user_branches ub ON ub.user_id = u.id
      WHERE u.id = $1 AND ${visibility.sql}
      GROUP BY u.id`,
    [userId, ...visibility.params],
  );

  if (!user) throw notFound('User');
  return user;
}

export async function getCurrentUser(auth: AuthContext): Promise<AppUser> {
  const user = await queryOne<AppUser>(
    `SELECT ${SELECT_COLUMNS}
       FROM public.users u
       LEFT JOIN public.user_branches ub ON ub.user_id = u.id
      WHERE u.id = $1
      GROUP BY u.id`,
    [auth.userId],
  );

  if (!user) throw notFound('User');
  return user;
}

function assertCanManage(auth: AuthContext, targetRole: UserRole, branchIds: string[]) {
  if (!canAssignRole(auth.role, targetRole)) {
    throw forbidden(`You are not permitted to assign the ${targetRole} role.`);
  }

  // Every branch being granted must itself be a branch the actor controls,
  // otherwise a Branch Admin could grant access to a branch they cannot see.
  for (const branchId of branchIds) {
    assertBranchAccess(auth, branchId);
  }
}

/**
 * Creates the Supabase Auth identity and the application profile together.
 *
 * The identity lives outside our database, so it cannot join the transaction.
 * If the profile write fails, the orphaned auth user is deleted so a retry
 * with the same email is not blocked.
 */
export async function createUser(
  auth: AuthContext,
  input: CreateUserInput,
): Promise<AppUser> {
  assertCanManage(auth, input.role, input.branch_ids);

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: input.email,
    email_confirm: false,
    user_metadata: { full_name: input.full_name },
  });

  if (error || !data.user) {
    if (error?.message?.toLowerCase().includes('already')) {
      throw new AppError(409, ErrorCode.CONFLICT, 'A user with this email already exists.');
    }
    logger.error({ err: error }, 'Supabase user creation failed');
    throw new AppError(
      502,
      ErrorCode.INTERNAL_ERROR,
      'Could not create the account with the identity provider.',
    );
  }

  const authUserId = data.user.id;

  try {
    return await withTransaction(async (tx) => {
      await tx.query(
        `INSERT INTO public.users (id, email, full_name, phone, role, created_by)
         VALUES ($1, $2, $3, $4, $5::user_role, $6)`,
        [authUserId, input.email, input.full_name, input.phone ?? null, input.role, auth.userId],
      );

      for (const branchId of input.branch_ids) {
        await tx.query(
          `INSERT INTO public.user_branches (user_id, branch_id, is_primary)
           VALUES ($1, $2, $3)`,
          [authUserId, branchId, branchId === input.primary_branch_id],
        );
      }

      await recordAudit(tx, {
        branchId: input.branch_ids[0] ?? null,
        userId: auth.userId,
        action: AuditAction.USER_CREATED,
        entityType: 'user',
        entityId: authUserId,
        metadata: { role: input.role, branch_count: input.branch_ids.length },
      });

      const user = await tx.queryOne<AppUser>(
        `SELECT ${SELECT_COLUMNS}
           FROM public.users u
           LEFT JOIN public.user_branches ub ON ub.user_id = u.id
          WHERE u.id = $1
          GROUP BY u.id`,
        [authUserId],
      );

      if (!user) throw notFound('User');
      return user;
    });
  } catch (error) {
    // Compensating delete: without it the email is permanently taken by an
    // account that has no profile and can never sign in usefully.
    await supabaseAdmin.auth.admin.deleteUser(authUserId).catch((cleanupError) => {
      logger.error(
        { err: cleanupError, authUserId },
        'Failed to clean up orphaned Supabase user after profile creation failure',
      );
    });
    throw error;
  }
}

export async function updateUser(
  auth: AuthContext,
  userId: string,
  input: UpdateUserInput,
): Promise<AppUser> {
  const existing = await getUser(auth, userId);

  if (input.role) {
    assertCanManage(auth, input.role, input.branch_ids ?? existing.branch_ids);
  }
  if (input.branch_ids) {
    for (const branchId of input.branch_ids) assertBranchAccess(auth, branchId);
  }

  if (userId === auth.userId && input.status && input.status !== 'ACTIVE') {
    throw badRequest(
      ErrorCode.VALIDATION_ERROR,
      'You cannot deactivate your own account.',
    );
  }
  if (userId === auth.userId && input.role && input.role !== auth.role) {
    throw badRequest(ErrorCode.VALIDATION_ERROR, 'You cannot change your own role.');
  }

  const result = await withTransaction(async (tx) => {
    const assignments: string[] = [];
    const values: unknown[] = [];
    let index = 1;

    if (input.full_name !== undefined) {
      assignments.push(`full_name = $${index++}`);
      values.push(input.full_name);
    }
    if (input.phone !== undefined) {
      assignments.push(`phone = $${index++}`);
      values.push(input.phone);
    }
    if (input.role !== undefined) {
      assignments.push(`role = $${index++}::user_role`);
      values.push(input.role);
    }
    if (input.status !== undefined) {
      assignments.push(`status = $${index++}::user_status`);
      values.push(input.status);
    }

    if (assignments.length > 0) {
      await tx.query(
        `UPDATE public.users SET ${assignments.join(', ')} WHERE id = $${index}`,
        [...values, userId],
      );
    }

    if (input.branch_ids) {
      await tx.query('DELETE FROM public.user_branches WHERE user_id = $1', [userId]);
      for (const branchId of input.branch_ids) {
        await tx.query(
          `INSERT INTO public.user_branches (user_id, branch_id, is_primary)
           VALUES ($1, $2, $3)`,
          [userId, branchId, branchId === input.primary_branch_id],
        );
      }
    }

    await recordAudit(tx, {
      branchId: (input.branch_ids ?? existing.branch_ids)[0] ?? null,
      userId: auth.userId,
      action: AuditAction.USER_UPDATED,
      entityType: 'user',
      entityId: userId,
      metadata: { changed: Object.keys(input) },
    });

    const user = await tx.queryOne<AppUser>(
      `SELECT ${SELECT_COLUMNS}
         FROM public.users u
         LEFT JOIN public.user_branches ub ON ub.user_id = u.id
        WHERE u.id = $1
        GROUP BY u.id`,
      [userId],
    );

    if (!user) throw notFound('User');
    return user;
  });

  invalidateProfileCache(userId);
  return result;
}

/**
 * Sends a Supabase password recovery email. Always reports success so the
 * endpoint cannot be used to discover which addresses have accounts.
 */
export async function sendPasswordReset(email: string, redirectTo?: string): Promise<void> {
  const { error } = await supabaseAdmin.auth.resetPasswordForEmail(
    email,
    redirectTo ? { redirectTo } : undefined,
  );

  if (error) {
    logger.warn({ err: error }, 'Password reset request failed');
  }
}
