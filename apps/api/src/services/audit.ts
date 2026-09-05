import type { AuditAction } from '@manas/shared';
import { pool } from '../database/pool';
import type { Tx } from '../database/transaction';
import { logger } from '../utils/logger';

export interface AuditEntry {
  branchId: string | null;
  userId: string | null;
  action: AuditAction | string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
}

const SQL = `
  INSERT INTO public.audit_logs
    (branch_id, user_id, action, entity_type, entity_id, metadata, ip_address)
  VALUES ($1, $2, $3, $4, $5, $6, $7)
`;

/**
 * Writes an audit entry inside the caller's transaction, so the log and the
 * change it describes commit or roll back together.
 */
export async function recordAudit(tx: Tx, entry: AuditEntry): Promise<void> {
  await tx.query(SQL, [
    entry.branchId,
    entry.userId,
    entry.action,
    entry.entityType,
    entry.entityId ?? null,
    entry.metadata ? JSON.stringify(entry.metadata) : null,
    entry.ipAddress ?? null,
  ]);
}

/**
 * Fire-and-forget variant for read-only actions worth tracing. A failure here
 * must never fail the request that triggered it.
 */
export function recordAuditDetached(entry: AuditEntry): void {
  pool
    .query(SQL, [
      entry.branchId,
      entry.userId,
      entry.action,
      entry.entityType,
      entry.entityId ?? null,
      entry.metadata ? JSON.stringify(entry.metadata) : null,
      entry.ipAddress ?? null,
    ])
    .catch((error) => {
      logger.error({ err: error, action: entry.action }, 'Failed to write audit log');
    });
}
