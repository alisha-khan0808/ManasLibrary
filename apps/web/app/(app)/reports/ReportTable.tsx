'use client';

import { useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatDate, formatMoney, humanise } from '@/lib/format';

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');

const MONEY_COLUMNS = new Set([
  'total',
  'amount',
  'amount_paid',
  'balance',
  'collected',
  'invoiced',
  'outstanding',
  'plan_price',
  'cash',
  'upi',
  'bank_transfer',
  'card',
  'other',
]);

const DATE_COLUMNS = new Set([
  'admission_date',
  'start_date',
  'end_date',
  'due_date',
  'invoice_date',
  'payment_date',
  'attendance_date',
  'membership_end',
  'last_seen',
]);

const STATUS_COLUMNS = new Set(['status', 'source']);

function renderCell(column: string, value: unknown) {
  if (value === null || value === undefined || value === '') {
    return <span className="text-content-subtle">—</span>;
  }
  if (MONEY_COLUMNS.has(column)) {
    return <span className="tabular-nums">{formatMoney(String(value))}</span>;
  }
  if (DATE_COLUMNS.has(column)) {
    return <span className="tabular-nums">{formatDate(String(value))}</span>;
  }
  if (STATUS_COLUMNS.has(column)) {
    return <StatusBadge status={String(value)} />;
  }
  return <span>{String(value)}</span>;
}

/**
 * Renders whatever columns a report returns, so a new report needs no frontend
 * change. CSV export re-requests the same report with format=csv, which keeps
 * the export authorized and filtered exactly like the on-screen version.
 */
export function ReportTable({
  rows,
  reportName,
  exportQuery,
}: {
  rows: Record<string, unknown>[];
  reportName: string;
  exportQuery: string;
}) {
  const toast = useToast();
  const [downloading, setDownloading] = useState(false);

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No rows for this report"
        description="Adjust the date range or branch filter and try again."
      />
    );
  }

  const columns = Object.keys(rows[0]!).filter((key) => !key.endsWith('_id') || key === 'id');
  const displayColumns = columns.filter((key) => key !== 'id');

  async function exportCsv() {
    setDownloading(true);

    try {
      const {
        data: { session },
      } = await getSupabaseBrowserClient().auth.getSession();

      const response = await fetch(
        `${API_URL}/api/v1/reports/${reportName}?${exportQuery}`,
        {
          headers: session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {},
        },
      );

      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${reportName}-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Could not export this report.');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
        <p className="text-sm text-content-muted">
          <span className="font-medium text-content">{rows.length}</span> row(s)
        </p>
        <Button variant="secondary" size="sm" onClick={exportCsv} loading={downloading}>
          Export CSV
        </Button>
      </div>

      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border bg-surface-sunken/60">
              {displayColumns.map((column) => (
                <th
                  key={column}
                  scope="col"
                  className="table-cell whitespace-nowrap text-[11px] font-medium uppercase tracking-wide text-content-subtle"
                >
                  {humanise(column)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={String(row.id ?? index)}
                className="border-b border-border last:border-0 hover:bg-surface-sunken/50"
              >
                {displayColumns.map((column) => (
                  <td key={column} className="table-cell whitespace-nowrap text-content">
                    {renderCell(column, row[column])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
