'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiClientError } from '@/lib/api-client';
import { useToast } from '@/components/ui/Toast';
import { DataTable } from '@/components/ui/DataTable';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatDateTime } from '@/lib/format';

export interface RosterRow {
  student_id: string;
  full_name: string;
  student_code: string;
  mobile: string;
  branch_id: string;
  attendance_id: string | null;
  attendance_status: string | null;
  source: string | null;
  check_in_time: string | null;
  check_out_time: string | null;
  batch_id: string | null;
  batch_name: string | null;
}

export function AttendanceRoster({
  rows,
  date,
  error,
}: {
  rows: RosterRow[];
  date: string;
  error: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  // Tracked per student so one slow request does not disable the whole table.
  const [pending, setPending] = useState<Record<string, boolean>>({});

  async function mark(row: RosterRow, status: 'PRESENT' | 'ABSENT' | 'LATE') {
    setPending((current) => ({ ...current, [row.student_id]: true }));

    try {
      const result = row.attendance_id
        ? await api.patch(`/attendance/${row.attendance_id}`, { status })
        : await api.post('/attendance', {
            branch_id: row.branch_id,
            student_id: row.student_id,
            batch_id: row.batch_id,
            attendance_date: date,
            check_in_time: status === 'ABSENT' ? null : new Date().toISOString(),
            status,
          });

      toast.success(result.message);
      router.refresh();
    } catch (caught) {
      toast.error(
        caught instanceof ApiClientError
          ? caught.message
          : 'Could not save attendance. Please try again.',
      );
    } finally {
      setPending((current) => ({ ...current, [row.student_id]: false }));
    }
  }

  return (
    <DataTable
      rows={rows}
      rowKey={(row) => row.student_id}
      error={error}
      caption={`Attendance roster for ${date}`}
      emptyTitle="No active students"
      emptyDescription="Students appear here once they have an active membership at this branch."
      columns={[
        {
          key: 'student',
          header: 'Student',
          render: (row) => (
            <div>
              <Link
                href={`/students/${row.student_id}`}
                className="font-medium text-brand hover:underline"
              >
                {row.full_name}
              </Link>
              <p className="text-xs text-content-subtle">{row.student_code}</p>
            </div>
          ),
        },
        {
          key: 'batch',
          header: 'Batch',
          secondary: true,
          render: (row) => (
            <span className="text-content-muted">{row.batch_name ?? '—'}</span>
          ),
        },
        {
          key: 'checkin',
          header: 'Check in',
          secondary: true,
          render: (row) => (
            <span className="tabular-nums text-content-muted">
              {row.check_in_time ? formatDateTime(row.check_in_time) : '—'}
            </span>
          ),
        },
        {
          key: 'source',
          header: 'Source',
          secondary: true,
          render: (row) =>
            row.source ? <StatusBadge status={row.source} tone="neutral" /> : <span>—</span>,
        },
        {
          key: 'status',
          header: 'Status',
          render: (row) =>
            row.attendance_status ? (
              <StatusBadge status={row.attendance_status} />
            ) : (
              <span className="text-xs text-content-subtle">Not marked</span>
            ),
        },
        {
          key: 'actions',
          header: 'Mark',
          align: 'right',
          render: (row) => (
            <div className="flex justify-end gap-1.5">
              <Button
                size="sm"
                variant={row.attendance_status === 'PRESENT' ? 'primary' : 'secondary'}
                loading={pending[row.student_id]}
                onClick={() => mark(row, 'PRESENT')}
              >
                Present
              </Button>
              <Button
                size="sm"
                variant={row.attendance_status === 'LATE' ? 'primary' : 'secondary'}
                disabled={pending[row.student_id]}
                onClick={() => mark(row, 'LATE')}
              >
                Late
              </Button>
              <Button
                size="sm"
                variant={row.attendance_status === 'ABSENT' ? 'danger' : 'secondary'}
                disabled={pending[row.student_id]}
                onClick={() => mark(row, 'ABSENT')}
              >
                Absent
              </Button>
            </div>
          ),
        },
      ]}
    />
  );
}
