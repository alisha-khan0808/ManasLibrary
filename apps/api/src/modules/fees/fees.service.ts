import { FeeReminderStatus, type AuthContext, type FeeReminder } from '@manas/shared';
import { query, queryOne } from '../../database/pool';
import { withTransaction } from '../../database/transaction';
import { branchPredicate, resolveBranchScope } from '../../guards/branch';
import { getNotificationProvider } from '../../integrations/notifications/NotificationProvider';
import { reminderMessage, reminderTypeFor } from '../../domain/fees';
import { logger } from '../../utils/logger';
import { buildPaginationMeta } from '../../utils/response';
import { today } from '../../domain/dates';

export async function listFeeSchedules(
  auth: AuthContext,
  params: {
    page: number;
    pageSize: number;
    branchId?: string;
    studentId?: string;
    status?: string;
    from?: string;
    to?: string;
  },
) {
  const { allowedBranchIds } = resolveBranchScope(auth, params.branchId);

  const conditions: string[] = [];
  const values: unknown[] = [];
  let index = 1;

  const scope = branchPredicate(allowedBranchIds, 'f.branch_id', index);
  conditions.push(scope.sql);
  values.push(...scope.params);
  index = scope.nextIndex;

  if (params.branchId) {
    conditions.push(`f.branch_id = $${index}`);
    values.push(params.branchId);
    index += 1;
  }
  if (params.studentId) {
    conditions.push(`f.student_id = $${index}`);
    values.push(params.studentId);
    index += 1;
  }
  if (params.status) {
    conditions.push(`f.status = $${index}::fee_schedule_status`);
    values.push(params.status);
    index += 1;
  }
  if (params.from) {
    conditions.push(`f.due_date >= $${index}`);
    values.push(params.from);
    index += 1;
  }
  if (params.to) {
    conditions.push(`f.due_date <= $${index}`);
    values.push(params.to);
    index += 1;
  }

  const where = `WHERE ${conditions.join(' AND ')}`;
  const offset = (params.page - 1) * params.pageSize;

  const rows = await query(
    `SELECT f.id, f.branch_id, f.student_id, f.invoice_id,
            f.amount::text AS amount, f.due_date, f.status,
            f.created_at, f.updated_at,
            s.full_name AS student_name, s.student_code::text AS student_code,
            s.mobile AS student_mobile,
            i.invoice_number::text AS invoice_number,
            i.balance::text AS invoice_balance
       FROM public.fee_schedules f
       JOIN public.students s ON s.id = f.student_id
       LEFT JOIN public.invoices i ON i.id = f.invoice_id
       ${where}
      ORDER BY f.due_date ASC
      LIMIT $${index} OFFSET $${index + 1}`,
    [...values, params.pageSize, offset],
  );

  const countRow = await queryOne<{ count: number }>(
    `SELECT count(*)::bigint AS count FROM public.fee_schedules f ${where}`,
    values,
  );

  const totalsRow = await queryOne<{ outstanding: string; overdue: string }>(
    `SELECT coalesce(sum(i.balance) FILTER (WHERE f.status <> 'PAID' AND f.status <> 'CANCELLED'), 0)::text AS outstanding,
            coalesce(sum(i.balance) FILTER (WHERE f.status = 'OVERDUE'), 0)::text AS overdue
       FROM public.fee_schedules f
       LEFT JOIN public.invoices i ON i.id = f.invoice_id
       ${where}`,
    values,
  );

  return {
    data: rows,
    meta: buildPaginationMeta(params.page, params.pageSize, countRow?.count ?? 0),
    totals: totalsRow ?? { outstanding: '0.00', overdue: '0.00' },
  };
}

/**
 * Re-derives fee status for every open schedule. Cheap, idempotent, and the
 * reason no row needs a write just because midnight passed.
 */
export async function refreshFeeStatuses(asOf = today()): Promise<number> {
  const updated = await query<{ id: string }>(
    `UPDATE public.fee_schedules f
        SET status = CASE
              WHEN i.status = 'PAID' THEN 'PAID'::fee_schedule_status
              WHEN i.status = 'CANCELLED' THEN 'CANCELLED'::fee_schedule_status
              WHEN f.due_date < $1::date THEN 'OVERDUE'::fee_schedule_status
              WHEN f.due_date = $1::date THEN 'DUE'::fee_schedule_status
              ELSE 'UPCOMING'::fee_schedule_status
            END
       FROM public.invoices i
      WHERE i.id = f.invoice_id
        AND f.status <> 'CANCELLED'
        AND f.status IS DISTINCT FROM CASE
              WHEN i.status = 'PAID' THEN 'PAID'::fee_schedule_status
              WHEN i.status = 'CANCELLED' THEN 'CANCELLED'::fee_schedule_status
              WHEN f.due_date < $1::date THEN 'OVERDUE'::fee_schedule_status
              WHEN f.due_date = $1::date THEN 'DUE'::fee_schedule_status
              ELSE 'UPCOMING'::fee_schedule_status
            END
      RETURNING f.id`,
    [asOf],
  );

  return updated.length;
}

interface DueFeeRow {
  fee_schedule_id: string;
  branch_id: string;
  branch_name: string;
  student_id: string;
  student_name: string;
  student_mobile: string;
  student_email: string | null;
  balance: string;
  due_date: string;
  invoice_status: string;
}

/**
 * Generates reminder records for fees that are due soon, due today or overdue,
 * then hands each to the configured notification provider.
 *
 * Idempotency comes from the unique index on
 * (fee_schedule_id, reminder_type, reminder_date): a retry after a partial
 * failure re-sends nothing that already went out.
 */
export async function processFeeReminders(
  asOf = today(),
): Promise<{ scanned: number; created: number; sent: number; failed: number }> {
  await refreshFeeStatuses(asOf);

  const rows = await query<DueFeeRow>(
    `SELECT f.id AS fee_schedule_id, f.branch_id, b.name AS branch_name,
            f.student_id, s.full_name AS student_name, s.mobile AS student_mobile,
            s.email::text AS student_email,
            coalesce(i.balance, f.amount)::text AS balance,
            f.due_date, coalesce(i.status::text, 'PENDING') AS invoice_status
       FROM public.fee_schedules f
       JOIN public.students s ON s.id = f.student_id
       JOIN public.branches b ON b.id = f.branch_id
       LEFT JOIN public.invoices i ON i.id = f.invoice_id
      WHERE f.status IN ('UPCOMING', 'DUE', 'OVERDUE')
        AND b.status = 'ACTIVE'
        AND s.status <> 'INACTIVE'
        AND coalesce(i.balance, f.amount) > 0
        AND f.due_date <= ($1::date + INTERVAL '3 days')`,
    [asOf],
  );

  const provider = getNotificationProvider();
  let createdCount = 0;
  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    const type = reminderTypeFor({
      dueDate: row.due_date,
      today: asOf,
      isPaid: row.invoice_status === 'PAID',
      isCancelled: row.invoice_status === 'CANCELLED',
    });

    if (!type) continue;

    const reminder = await withTransaction(async (tx) =>
      tx.queryOne<FeeReminder>(
        `INSERT INTO public.fee_reminders
           (branch_id, student_id, fee_schedule_id, reminder_type, reminder_date, provider)
         VALUES ($1, $2, $3, $4::reminder_type, $5, $6)
         ON CONFLICT (fee_schedule_id, reminder_type, reminder_date) DO NOTHING
         RETURNING *`,
        [row.branch_id, row.student_id, row.fee_schedule_id, type, asOf, provider.name],
      ),
    );

    // Already handled on an earlier run today.
    if (!reminder) continue;
    createdCount += 1;

    const message = reminderMessage({
      studentName: row.student_name,
      branchName: row.branch_name,
      amount: row.balance,
      dueDate: row.due_date,
      type,
    });

    const result = await provider.send({
      recipient: row.student_mobile,
      subject: 'Library fee reminder',
      body: message,
      metadata: { branch_id: row.branch_id, fee_schedule_id: row.fee_schedule_id },
    });

    if (result.delivered) {
      sent += 1;
      await query(
        `UPDATE public.fee_reminders
            SET status = $2::reminder_status, sent_at = now()
          WHERE id = $1`,
        [reminder.id, FeeReminderStatus.SENT],
      );
    } else {
      failed += 1;
      await query(
        `UPDATE public.fee_reminders
            SET status = $2::reminder_status, error_message = $3
          WHERE id = $1`,
        [
          reminder.id,
          provider.name === 'none' ? FeeReminderStatus.SKIPPED : FeeReminderStatus.FAILED,
          result.error ?? null,
        ],
      );
    }
  }

  logger.info(
    { scanned: rows.length, created: createdCount, sent, failed, asOf },
    'Fee reminder run complete',
  );

  return { scanned: rows.length, created: createdCount, sent, failed };
}

export async function listReminders(
  auth: AuthContext,
  params: { page: number; pageSize: number; branchId?: string; status?: string },
) {
  const { allowedBranchIds } = resolveBranchScope(auth, params.branchId);

  const conditions: string[] = [];
  const values: unknown[] = [];
  let index = 1;

  const scope = branchPredicate(allowedBranchIds, 'r.branch_id', index);
  conditions.push(scope.sql);
  values.push(...scope.params);
  index = scope.nextIndex;

  if (params.branchId) {
    conditions.push(`r.branch_id = $${index}`);
    values.push(params.branchId);
    index += 1;
  }
  if (params.status) {
    conditions.push(`r.status = $${index}::reminder_status`);
    values.push(params.status);
    index += 1;
  }

  const where = `WHERE ${conditions.join(' AND ')}`;
  const offset = (params.page - 1) * params.pageSize;

  const rows = await query(
    `SELECT r.*, s.full_name AS student_name, s.mobile AS student_mobile
       FROM public.fee_reminders r
       JOIN public.students s ON s.id = r.student_id
       ${where}
      ORDER BY r.created_at DESC
      LIMIT $${index} OFFSET $${index + 1}`,
    [...values, params.pageSize, offset],
  );

  const countRow = await queryOne<{ count: number }>(
    `SELECT count(*)::bigint AS count FROM public.fee_reminders r ${where}`,
    values,
  );

  return {
    data: rows,
    meta: buildPaginationMeta(params.page, params.pageSize, countRow?.count ?? 0),
  };
}
