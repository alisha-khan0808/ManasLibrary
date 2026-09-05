import type { Metadata } from 'next';
import Link from 'next/link';
import type { Attendance, PaginationMeta } from '@manas/shared';
import { apiFetchSafe } from '@/lib/api';
import { Card, PageHeader } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';
import { DateFilter, FilterBar, FilterSelect, Pagination } from '@/components/ui/Filters';
import { addDaysIso, formatDate, formatDateTime, todayIso } from '@/lib/format';

export const metadata: Metadata = { title: 'Attendance history' };

type AttendanceRow = Attendance & {
  student_name: string;
  student_code: string;
  student_mobile: string;
  batch_name: string | null;
};

export default async function AttendanceHistoryPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const page = Number.parseInt(searchParams.page ?? '1', 10);
  const from = searchParams.from ?? addDaysIso(todayIso(), -29);
  const to = searchParams.to ?? todayIso();

  const result = await apiFetchSafe<AttendanceRow[]>(
    '/attendance',
    {
      query: {
        page,
        pageSize: 50,
        branchId: searchParams.branchId,
        from,
        to,
        status: searchParams.status,
        source: searchParams.source,
      },
    },
    [],
  );

  const meta: PaginationMeta = result.meta ?? { page, pageSize: 50, total: 0, totalPages: 0 };

  return (
    <>
      <PageHeader
        title="Attendance history"
        description={`Records from ${formatDate(from)} to ${formatDate(to)}.`}
        action={
          <Link href="/attendance">
            <Button variant="secondary">Back to today</Button>
          </Link>
        }
      />

      <FilterBar>
        <DateFilter paramName="from" label="From" />
        <DateFilter paramName="to" label="To" />
        <FilterSelect
          paramName="status"
          label="Status"
          options={[
            { value: 'PRESENT', label: 'Present' },
            { value: 'LATE', label: 'Late' },
            { value: 'ABSENT', label: 'Absent' },
          ]}
        />
        <FilterSelect
          paramName="source"
          label="Source"
          options={[
            { value: 'MANUAL', label: 'Manual' },
            { value: 'BIOMETRIC', label: 'Biometric' },
            { value: 'IMPORTED', label: 'Imported' },
          ]}
        />
      </FilterBar>

      <Card padded={false}>
        <DataTable
          rows={result.data}
          rowKey={(row) => row.id}
          error={result.error}
          caption="Attendance history"
          emptyTitle="No attendance in this range"
          emptyDescription="Widen the date range or clear the filters."
          columns={[
            {
              key: 'date',
              header: 'Date',
              render: (row) => (
                <span className="tabular-nums">{formatDate(row.attendance_date)}</span>
              ),
            },
            {
              key: 'student',
              header: 'Student',
              render: (row) => (
                <div>
                  <Link
                    href={`/students/${row.student_id}`}
                    className="font-medium text-brand hover:underline"
                  >
                    {row.student_name}
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
              key: 'in',
              header: 'Check in',
              secondary: true,
              render: (row) => (
                <span className="tabular-nums text-content-muted">
                  {row.check_in_time ? formatDateTime(row.check_in_time) : '—'}
                </span>
              ),
            },
            {
              key: 'out',
              header: 'Check out',
              secondary: true,
              render: (row) => (
                <span className="tabular-nums text-content-muted">
                  {row.check_out_time ? formatDateTime(row.check_out_time) : '—'}
                </span>
              ),
            },
            {
              key: 'source',
              header: 'Source',
              secondary: true,
              render: (row) => <StatusBadge status={row.source} tone="neutral" />,
            },
            {
              key: 'status',
              header: 'Status',
              align: 'right',
              render: (row) => <StatusBadge status={row.status} />,
            },
          ]}
        />
        <Pagination {...meta} />
      </Card>
    </>
  );
}
