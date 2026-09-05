import {
  AttendanceStatus,
  AuditAction,
  DeviceStatus,
  ErrorCode,
  type AuthContext,
  type BiometricDevice,
  type BiometricMapping,
} from '@manas/shared';
import { query, queryOne } from '../../database/pool';
import { withTransaction, type Tx } from '../../database/transaction';
import {
  assertBranchAccess,
  branchPredicate,
  requireBranchForWrite,
  resolveBranchScope,
} from '../../guards/branch';
import { getBiometricProvider } from '../../integrations/biometric/providers';
import type { BiometricPunch } from '../../integrations/biometric/BiometricProvider';
import { recordAudit } from '../../services/audit';
import { AppError, conflict, notFound } from '../../utils/errors';
import { logger } from '../../utils/logger';

const DEVICE_COLUMNS = `
  id, branch_id, name, device_identifier::text AS device_identifier,
  host(ip_address) AS ip_address, api_endpoint, status, last_sync_at,
  last_error, created_at, updated_at
`;

/* --------------------------------------------------------------------------
 * Devices
 * ----------------------------------------------------------------------- */

export async function listDevices(
  auth: AuthContext,
  params: { branchId?: string },
): Promise<BiometricDevice[]> {
  const { allowedBranchIds } = resolveBranchScope(auth, params.branchId);
  const scope = branchPredicate(allowedBranchIds, 'branch_id', 1);
  const values = [...scope.params];

  const branchCondition = params.branchId ? `AND branch_id = $${scope.nextIndex}` : '';
  if (params.branchId) values.push(params.branchId);

  return query<BiometricDevice>(
    `SELECT ${DEVICE_COLUMNS} FROM public.biometric_devices
      WHERE ${scope.sql} ${branchCondition}
      ORDER BY name ASC`,
    values,
  );
}

export async function createDevice(
  auth: AuthContext,
  input: {
    branch_id?: string;
    name: string;
    device_identifier: string;
    ip_address?: string | null;
    api_endpoint?: string | null;
  },
): Promise<BiometricDevice> {
  const branchId = requireBranchForWrite(auth, input.branch_id);

  const device = await queryOne<BiometricDevice>(
    `INSERT INTO public.biometric_devices
       (branch_id, name, device_identifier, ip_address, api_endpoint)
     VALUES ($1, $2, $3, $4::inet, $5)
     RETURNING ${DEVICE_COLUMNS}`,
    [
      branchId,
      input.name,
      input.device_identifier,
      input.ip_address ?? null,
      input.api_endpoint ?? null,
    ],
  );

  return device!;
}

export async function getDevice(
  auth: AuthContext,
  deviceId: string,
): Promise<BiometricDevice> {
  const device = await queryOne<BiometricDevice>(
    `SELECT ${DEVICE_COLUMNS} FROM public.biometric_devices WHERE id = $1`,
    [deviceId],
  );

  if (!device) throw notFound('Biometric device');
  assertBranchAccess(auth, device.branch_id);
  return device;
}

export async function updateDevice(
  auth: AuthContext,
  deviceId: string,
  input: Record<string, unknown>,
): Promise<BiometricDevice> {
  await getDevice(auth, deviceId);

  const assignments: string[] = [];
  const values: unknown[] = [];
  let index = 1;

  for (const field of ['name', 'api_endpoint'] as const) {
    if (input[field] === undefined) continue;
    assignments.push(`${field} = $${index++}`);
    values.push(input[field]);
  }
  if (input.ip_address !== undefined) {
    assignments.push(`ip_address = $${index++}::inet`);
    values.push(input.ip_address);
  }
  if (input.status !== undefined) {
    assignments.push(`status = $${index++}::device_status`);
    values.push(input.status);
  }

  if (assignments.length === 0) return getDevice(auth, deviceId);

  const device = await queryOne<BiometricDevice>(
    `UPDATE public.biometric_devices SET ${assignments.join(', ')}
      WHERE id = $${index}
      RETURNING ${DEVICE_COLUMNS}`,
    [...values, deviceId],
  );

  return device!;
}

export async function testDevice(auth: AuthContext, deviceId: string) {
  const device = await getDevice(auth, deviceId);
  const provider = getBiometricProvider();

  const report = await provider.testConnection({
    deviceIdentifier: device.device_identifier,
    apiEndpoint: device.api_endpoint,
    ipAddress: device.ip_address,
  });

  await query(
    `UPDATE public.biometric_devices
        SET status = $2::device_status, last_error = $3
      WHERE id = $1`,
    [
      deviceId,
      report.reachable ? DeviceStatus.ACTIVE : DeviceStatus.ERROR,
      report.reachable ? null : report.message,
    ],
  );

  return { provider: provider.name, ...report };
}

/* --------------------------------------------------------------------------
 * Student mapping
 * ----------------------------------------------------------------------- */

export async function listMappings(
  auth: AuthContext,
  params: { branchId?: string; deviceId?: string },
) {
  const { allowedBranchIds } = resolveBranchScope(auth, params.branchId);

  const conditions: string[] = [];
  const values: unknown[] = [];
  let index = 1;

  const scope = branchPredicate(allowedBranchIds, 'm.branch_id', index);
  conditions.push(scope.sql);
  values.push(...scope.params);
  index = scope.nextIndex;

  if (params.branchId) {
    conditions.push(`m.branch_id = $${index}`);
    values.push(params.branchId);
    index += 1;
  }
  if (params.deviceId) {
    conditions.push(`m.device_id = $${index}`);
    values.push(params.deviceId);
    index += 1;
  }

  return query(
    `SELECT m.*, s.full_name AS student_name, s.student_code::text AS student_code,
            d.name AS device_name
       FROM public.biometric_mappings m
       JOIN public.students s ON s.id = m.student_id
       JOIN public.biometric_devices d ON d.id = m.device_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY s.full_name ASC`,
    values,
  );
}

/**
 * Creates a device-user → student mapping.
 *
 * The critical rule from PRD §26 is that the device, the mapping and the
 * student must all be in the same authorized branch. That is checked here and
 * again by the composite foreign keys in migration 0008.
 */
export async function createMapping(
  auth: AuthContext,
  input: { branch_id?: string; device_id: string; biometric_user_id: string; student_id: string },
): Promise<BiometricMapping> {
  const branchId = requireBranchForWrite(auth, input.branch_id);

  return withTransaction(async (tx) => {
    const device = await tx.queryOne<{ id: string; branch_id: string }>(
      'SELECT id, branch_id FROM public.biometric_devices WHERE id = $1',
      [input.device_id],
    );

    if (!device) throw notFound('Biometric device');
    if (device.branch_id !== branchId) {
      throw new AppError(
        403,
        ErrorCode.BIOMETRIC_MAPPING_MISMATCH,
        'The device belongs to a different branch.',
      );
    }

    const student = await tx.queryOne<{ id: string; branch_id: string }>(
      'SELECT id, branch_id FROM public.students WHERE id = $1',
      [input.student_id],
    );

    if (!student) throw notFound('Student');
    if (student.branch_id !== branchId) {
      throw new AppError(
        403,
        ErrorCode.BIOMETRIC_MAPPING_MISMATCH,
        'The student belongs to a different branch than the device.',
      );
    }

    const mapping = await tx.queryOne<BiometricMapping>(
      `INSERT INTO public.biometric_mappings
         (branch_id, device_id, biometric_user_id, student_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [branchId, input.device_id, input.biometric_user_id, input.student_id],
    );

    return mapping!;
  });
}

export async function deleteMapping(auth: AuthContext, mappingId: string): Promise<void> {
  const mapping = await queryOne<BiometricMapping>(
    'SELECT * FROM public.biometric_mappings WHERE id = $1',
    [mappingId],
  );

  if (!mapping) throw notFound('Biometric mapping');
  assertBranchAccess(auth, mapping.branch_id);

  await query('DELETE FROM public.biometric_mappings WHERE id = $1', [mappingId]);
}

/* --------------------------------------------------------------------------
 * Synchronisation
 * ----------------------------------------------------------------------- */

export interface SyncResult {
  deviceId: string;
  fetched: number;
  newEvents: number;
  attendanceCreated: number;
  attendanceUpdated: number;
  unmapped: number;
  error?: string;
}

/**
 * Pulls punches from a device and turns them into attendance.
 *
 * Deduplication happens twice (PRD §27):
 *   1. raw events are inserted with ON CONFLICT DO NOTHING against
 *      (device_id, biometric_record_id) — replaying a window is a no-op;
 *   2. attendance is one row per student per day, so multiple punches on the
 *      same day update check-in/check-out rather than adding rows.
 */
export async function syncDevice(
  auth: AuthContext | null,
  deviceId: string,
  window: { since: Date; until: Date },
): Promise<SyncResult> {
  const device = await queryOne<BiometricDevice>(
    `SELECT ${DEVICE_COLUMNS} FROM public.biometric_devices WHERE id = $1`,
    [deviceId],
  );

  if (!device) throw notFound('Biometric device');
  if (auth) assertBranchAccess(auth, device.branch_id);

  if (device.status === DeviceStatus.INACTIVE) {
    throw conflict(ErrorCode.BIOMETRIC_NOT_CONFIGURED, 'This device is inactive.');
  }

  const provider = getBiometricProvider();
  let punches: BiometricPunch[];

  try {
    punches = await provider.syncAttendance(
      {
        deviceIdentifier: device.device_identifier,
        apiEndpoint: device.api_endpoint,
        ipAddress: device.ip_address,
      },
      window.since,
      window.until,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    await query(
      `UPDATE public.biometric_devices
          SET status = 'ERROR'::device_status, last_error = $2
        WHERE id = $1`,
      [deviceId, message],
    );

    return {
      deviceId,
      fetched: 0,
      newEvents: 0,
      attendanceCreated: 0,
      attendanceUpdated: 0,
      unmapped: 0,
      error: message,
    };
  }

  const result = await withTransaction(async (tx) =>
    ingestPunches(tx, device, punches, auth?.userId ?? null),
  );

  await query(
    `UPDATE public.biometric_devices
        SET last_sync_at = now(), status = 'ACTIVE'::device_status, last_error = NULL
      WHERE id = $1`,
    [deviceId],
  );

  return result;
}

async function ingestPunches(
  tx: Tx,
  device: BiometricDevice,
  punches: BiometricPunch[],
  userId: string | null,
): Promise<SyncResult> {
  let newEvents = 0;
  let attendanceCreated = 0;
  let attendanceUpdated = 0;
  let unmapped = 0;

  for (const punch of punches) {
    const event = await tx.queryOne<{ id: string }>(
      `INSERT INTO public.biometric_events
         (branch_id, device_id, biometric_record_id, biometric_user_id, event_time,
          direction, raw_payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (device_id, biometric_record_id) DO NOTHING
       RETURNING id`,
      [
        device.branch_id,
        device.id,
        punch.recordId,
        punch.biometricUserId,
        punch.timestamp.toISOString(),
        punch.direction ?? null,
        punch.raw ? JSON.stringify(punch.raw) : null,
      ],
    );

    // Already ingested on an earlier run — nothing more to do.
    if (!event) continue;
    newEvents += 1;

    const mapping = await tx.queryOne<{ student_id: string; branch_id: string }>(
      `SELECT student_id, branch_id FROM public.biometric_mappings
        WHERE device_id = $1 AND biometric_user_id = $2`,
      [device.id, punch.biometricUserId],
    );

    if (!mapping) {
      unmapped += 1;
      await tx.query(
        `UPDATE public.biometric_events
            SET error_message = 'No student mapping for this biometric user id'
          WHERE id = $1`,
        [event.id],
      );
      continue;
    }

    // Defence in depth: the mapping's branch must match the device's branch.
    if (mapping.branch_id !== device.branch_id) {
      unmapped += 1;
      logger.error(
        { deviceId: device.id, mappingBranch: mapping.branch_id },
        'Biometric mapping branch does not match device branch — punch ignored',
      );
      await tx.query(
        `UPDATE public.biometric_events
            SET error_message = 'Mapping branch does not match device branch'
          WHERE id = $1`,
        [event.id],
      );
      continue;
    }

    const attendanceDate = punch.timestamp.toISOString().slice(0, 10);

    const existing = await tx.queryOne<{ id: string; check_in_time: string | null }>(
      `SELECT id, check_in_time FROM public.attendance
        WHERE student_id = $1 AND attendance_date = $2 FOR UPDATE`,
      [mapping.student_id, attendanceDate],
    );

    let attendanceId: string;

    if (existing) {
      // Later punches extend the day: the earliest becomes check-in, the
      // latest becomes check-out.
      const updated = await tx.queryOne<{ id: string }>(
        `UPDATE public.attendance
            SET check_in_time  = LEAST(coalesce(check_in_time, $2::timestamptz), $2::timestamptz),
                check_out_time = GREATEST(coalesce(check_out_time, $2::timestamptz), $2::timestamptz),
                source         = 'BIOMETRIC'::attendance_source,
                device_id      = coalesce(device_id, $3)
          WHERE id = $1
          RETURNING id`,
        [existing.id, punch.timestamp.toISOString(), device.id],
      );
      attendanceId = updated!.id;
      attendanceUpdated += 1;
    } else {
      const batch = await tx.queryOne<{ batch_id: string }>(
        `SELECT batch_id FROM public.batch_students
          WHERE student_id = $1 AND status = 'ACTIVE' LIMIT 1`,
        [mapping.student_id],
      );

      const inserted = await tx.queryOne<{ id: string }>(
        `INSERT INTO public.attendance
           (branch_id, student_id, batch_id, attendance_date, check_in_time, status,
            source, device_id, biometric_record_id, recorded_by)
         VALUES ($1, $2, $3, $4, $5::timestamptz, $6::attendance_status,
                 'BIOMETRIC'::attendance_source, $7, $8, $9)
         RETURNING id`,
        [
          device.branch_id,
          mapping.student_id,
          batch?.batch_id ?? null,
          attendanceDate,
          punch.timestamp.toISOString(),
          AttendanceStatus.PRESENT,
          device.id,
          punch.recordId,
          userId,
        ],
      );
      attendanceId = inserted!.id;
      attendanceCreated += 1;
    }

    await tx.query(
      `UPDATE public.biometric_events
          SET processed = true, student_id = $2, attendance_id = $3
        WHERE id = $1`,
      [event.id, mapping.student_id, attendanceId],
    );
  }

  await recordAudit(tx, {
    branchId: device.branch_id,
    userId,
    action: AuditAction.BIOMETRIC_SYNCED,
    entityType: 'biometric_device',
    entityId: device.id,
    metadata: { fetched: punches.length, newEvents, attendanceCreated, attendanceUpdated, unmapped },
  });

  return {
    deviceId: device.id,
    fetched: punches.length,
    newEvents,
    attendanceCreated,
    attendanceUpdated,
    unmapped,
  };
}

/** Punches that arrived from an unregistered device user, for the mapping UI. */
export async function unmappedEvents(auth: AuthContext, params: { branchId?: string }) {
  const { allowedBranchIds } = resolveBranchScope(auth, params.branchId);
  const scope = branchPredicate(allowedBranchIds, 'e.branch_id', 1);

  return query(
    `SELECT e.device_id, d.name AS device_name, e.biometric_user_id,
            count(*)::bigint AS punch_count,
            min(e.event_time) AS first_seen,
            max(e.event_time) AS last_seen
       FROM public.biometric_events e
       JOIN public.biometric_devices d ON d.id = e.device_id
      WHERE ${scope.sql} AND NOT e.processed
      GROUP BY e.device_id, d.name, e.biometric_user_id
      ORDER BY max(e.event_time) DESC
      LIMIT 200`,
    scope.params,
  );
}

/** Used by the scheduled job: every device that is due for a pull. */
export async function activeDeviceIds(): Promise<string[]> {
  const rows = await query<{ id: string }>(
    `SELECT d.id FROM public.biometric_devices d
       JOIN public.branches b ON b.id = d.branch_id
      WHERE d.status = 'ACTIVE' AND b.status = 'ACTIVE'`,
  );
  return rows.map((row) => row.id);
}
