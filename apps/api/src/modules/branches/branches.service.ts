import { AuditAction, type AuthContext, type Branch } from '@manas/shared';
import { query, queryOne } from '../../database/pool';
import { withTransaction } from '../../database/transaction';
import { assertBranchAccess, branchPredicate } from '../../guards/branch';
import { branchFilterFor } from '../../domain/branchAccess';
import { recordAudit } from '../../services/audit';
import { notFound } from '../../utils/errors';
import { buildPaginationMeta } from '../../utils/response';
import type { CreateBranchInput, UpdateBranchInput } from './branches.schema';
import { invalidateProfileCache } from '../../middleware/auth';

const SELECT_COLUMNS = `
  id,
  branch_code::text AS branch_code,
  name,
  address,
  city,
  state,
  phone,
  email::text AS email,
  to_char(opening_time, 'HH24:MI') AS opening_time,
  to_char(closing_time, 'HH24:MI') AS closing_time,
  status,
  created_at,
  updated_at
`;

export async function listBranches(
  auth: AuthContext,
  params: { page: number; pageSize: number; search?: string; status?: string },
) {
  const allowed = branchFilterFor(auth);
  const conditions: string[] = [];
  const values: unknown[] = [];
  let index = 1;

  const scope = branchPredicate(allowed, 'id', index);
  conditions.push(scope.sql);
  values.push(...scope.params);
  index = scope.nextIndex;

  if (params.search) {
    conditions.push(`(name ILIKE $${index} OR branch_code::text ILIKE $${index} OR city ILIKE $${index})`);
    values.push(`%${params.search}%`);
    index += 1;
  }

  if (params.status) {
    conditions.push(`status = $${index}::branch_status`);
    values.push(params.status);
    index += 1;
  }

  const where = `WHERE ${conditions.join(' AND ')}`;
  const offset = (params.page - 1) * params.pageSize;

  const rows = await query<Branch>(
    `SELECT ${SELECT_COLUMNS} FROM public.branches ${where}
      ORDER BY name ASC
      LIMIT $${index} OFFSET $${index + 1}`,
    [...values, params.pageSize, offset],
  );

  const countRow = await queryOne<{ count: number }>(
    `SELECT count(*)::bigint AS count FROM public.branches ${where}`,
    values,
  );

  return {
    data: rows,
    meta: buildPaginationMeta(params.page, params.pageSize, countRow?.count ?? 0),
  };
}

export async function getBranch(auth: AuthContext, branchId: string): Promise<Branch> {
  assertBranchAccess(auth, branchId);

  const branch = await queryOne<Branch>(
    `SELECT ${SELECT_COLUMNS} FROM public.branches WHERE id = $1`,
    [branchId],
  );

  if (!branch) throw notFound('Branch');
  return branch;
}

export async function getBranchStats(auth: AuthContext, branchId: string) {
  assertBranchAccess(auth, branchId);

  const row = await queryOne<{
    total_seats: number;
    occupied_seats: number;
    available_seats: number;
    active_students: number;
    active_batches: number;
    staff_count: number;
  }>(
    `SELECT
       (SELECT count(*) FROM public.seats WHERE branch_id = $1)::bigint AS total_seats,
       (SELECT count(*) FROM public.seats WHERE branch_id = $1 AND status = 'OCCUPIED')::bigint AS occupied_seats,
       (SELECT count(*) FROM public.seats WHERE branch_id = $1 AND status = 'AVAILABLE')::bigint AS available_seats,
       (SELECT count(*) FROM public.students WHERE branch_id = $1 AND status = 'ACTIVE')::bigint AS active_students,
       (SELECT count(*) FROM public.batches WHERE branch_id = $1 AND status = 'ACTIVE')::bigint AS active_batches,
       (SELECT count(*) FROM public.user_branches WHERE branch_id = $1)::bigint AS staff_count`,
    [branchId],
  );

  return row;
}

export async function createBranch(
  auth: AuthContext,
  input: CreateBranchInput,
): Promise<Branch> {
  return withTransaction(async (tx) => {
    const branch = await tx.queryOne<Branch>(
      `INSERT INTO public.branches
         (branch_code, name, address, city, state, phone, email, opening_time, closing_time, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING ${SELECT_COLUMNS}`,
      [
        input.branch_code,
        input.name,
        input.address ?? null,
        input.city ?? null,
        input.state ?? null,
        input.phone ?? null,
        input.email ?? null,
        input.opening_time ?? null,
        input.closing_time ?? null,
        input.status,
      ],
    );

    if (!branch) throw notFound('Branch');

    await recordAudit(tx, {
      branchId: branch.id,
      userId: auth.userId,
      action: AuditAction.BRANCH_CREATED,
      entityType: 'branch',
      entityId: branch.id,
      metadata: { branch_code: branch.branch_code, name: branch.name },
    });

    return branch;
  });
}

const UPDATABLE_FIELDS = [
  'name',
  'address',
  'city',
  'state',
  'phone',
  'email',
  'opening_time',
  'closing_time',
  'status',
] as const;

export async function updateBranch(
  auth: AuthContext,
  branchId: string,
  input: UpdateBranchInput,
): Promise<Branch> {
  assertBranchAccess(auth, branchId);

  const assignments: string[] = [];
  const values: unknown[] = [];
  let index = 1;

  for (const field of UPDATABLE_FIELDS) {
    const value = (input as Record<string, unknown>)[field];
    if (value === undefined) continue;

    // status is an enum column; the cast keeps the parameter untyped-safe.
    assignments.push(field === 'status' ? `status = $${index}::branch_status` : `${field} = $${index}`);
    values.push(value);
    index += 1;
  }

  if (assignments.length === 0) {
    return getBranch(auth, branchId);
  }

  return withTransaction(async (tx) => {
    const branch = await tx.queryOne<Branch>(
      `UPDATE public.branches SET ${assignments.join(', ')}
        WHERE id = $${index}
        RETURNING ${SELECT_COLUMNS}`,
      [...values, branchId],
    );

    if (!branch) throw notFound('Branch');

    await recordAudit(tx, {
      branchId: branch.id,
      userId: auth.userId,
      action: AuditAction.BRANCH_UPDATED,
      entityType: 'branch',
      entityId: branch.id,
      metadata: { changed: Object.keys(input) },
    });

    // A branch going inactive changes what its users may do; drop the cache so
    // the next request re-reads authorization state.
    invalidateProfileCache();

    return branch;
  });
}
