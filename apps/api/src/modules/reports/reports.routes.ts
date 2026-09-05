import { Router } from 'express';
import { z } from 'zod';
import { Permission } from '@manas/shared';
import { asyncHandler } from '../../middleware/asyncHandler';
import { getAuth } from '../../middleware/auth';
import { isoDateSchema, uuidSchema, validate } from '../../middleware/validate';
import { requirePermission } from '../../guards/rbac';
import { ok } from '../../utils/response';
import * as service from './reports.service';
import { notFound } from '../../utils/errors';

export const reportsRouter = Router();

const reportQuerySchema = z.object({
  branchId: uuidSchema.optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  batchId: uuidSchema.optional(),
  format: z.enum(['json', 'csv']).default('json'),
});

/** Report name → handler. Adding a report means adding one entry here. */
const REPORTS = {
  'active-students': service.activeStudentsReport,
  'new-admissions': service.newAdmissionsReport,
  'expired-memberships': service.expiredMembershipsReport,
  'seat-utilisation': service.seatUtilisationReport,
  'allocation-history': service.allocationHistoryReport,
  attendance: service.attendanceReport,
  absentees: service.absenteeReport,
  collections: service.collectionReport,
  'outstanding-fees': service.outstandingFeesReport,
  'branch-revenue': service.branchRevenueReport,
} as const;

type ReportName = keyof typeof REPORTS;

/** Minimal RFC-4180 CSV writer — no dependency needed for this shape of data. */
function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';

  const headers = Object.keys(rows[0]!);
  const escape = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    const text = String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  return [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => escape(row[header])).join(',')),
  ].join('\r\n');
}

reportsRouter.get(
  '/',
  requirePermission(Permission.REPORT_VIEW),
  asyncHandler(async (_req, res) =>
    ok(res, Object.keys(REPORTS), 'Available reports retrieved successfully'),
  ),
);

reportsRouter.get(
  '/:name',
  requirePermission(Permission.REPORT_VIEW),
  validate({
    params: z.object({ name: z.string() }),
    query: reportQuerySchema,
  }),
  asyncHandler(async (req, res) => {
    const name = req.params.name as ReportName;
    const handler = REPORTS[name];

    if (!handler) throw notFound('Report');

    const rows = (await handler(getAuth(req), req.query as never)) as Record<
      string,
      unknown
    >[];

    if ((req.query as { format?: string }).format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${name}-${new Date().toISOString().slice(0, 10)}.csv"`,
      );
      return res.status(200).send(toCsv(rows));
    }

    return ok(res, rows, 'Report generated successfully');
  }),
);
