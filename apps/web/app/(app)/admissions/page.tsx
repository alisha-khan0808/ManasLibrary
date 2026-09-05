import type { Metadata } from 'next';
import Link from 'next/link';
import type { Admission, PaginationMeta } from '@manas/shared';
import { apiFetchSafe } from '@/lib/api';
import { Card, PageHeader } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';
import { DateFilter, FilterBar, FilterSelect, Pagination, SearchInput } from '@/components/ui/Filters';
import { formatDate } from '@/lib/format';

export const metadata: Metadata = { title: 'Admissions' };

type AdmissionRow = Admission & {
  student_name: string;
  student_code: string;
  student_mobile: string;
  plan_name: string;
  seat_number: string | null;
  batch_name: string | null;
};

export default async function AdmissionsPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const page = Number.parseInt(searchParams.page ?? '1', 10);

  const result = await apiFetchSafe<AdmissionRow[]>(
    '/admissions',
    {
      query: {
        page,
        pageSize: 20,
        branchId: searchParams.branchId,
        status: searchParams.status,
        from: searchParams.from,
        to: searchParams.to,
        search: searchParams.search,
      },
    },
    [],
  );

  const meta: PaginationMeta = result.meta ?? { page, pageSize: 20, total: 0, totalPages: 0 };

  return (
    <>
      <PageHeader
        title="Admissions"
        description="Every membership sold, with its seat and batch assignment."
        action={
          <Link href="/admissions/new">
            <Button>New admission</Button>
          </Link>
        }
      />

      <FilterBar>
        <SearchInput placeholder="Admission number, name or mobile…" />
        <FilterSelect
          paramName="status"
          label="Status"
          options={[
            { value: 'CONFIRMED', label: 'Confirmed' },
            { value: 'PENDING', label: 'Pending' },
            { value: 'EXPIRED', label: 'Expired' },
            { value: 'CANCELLED', label: 'Cancelled' },
          ]}
        />
        <DateFilter paramName="from" label="From" />
        <DateFilter paramName="to" label="To" />
      </FilterBar>

      <Card padded={false}>
        <DataTable
          rows={result.data}
          rowKey={(row) => row.id}
          error={result.error}
          caption="Admissions"
          emptyTitle="No admissions yet"
          emptyDescription="Process an admission to assign a membership, seat and batch."
          emptyAction={
            <Link href="/admissions/new">
              <Button size="sm">New admission</Button>
            </Link>
          }
          columns={[
            {
              key: 'number',
              header: 'Admission',
              render: (row) => (
                <div>
                  <span className="font-medium tabular-nums text-content">
                    {row.admission_number}
                  </span>
                  <p className="text-xs text-content-subtle">
                    {formatDate(row.admission_date)}
                  </p>
                </div>
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
                  <p className="text-xs text-content-subtle">{row.student_mobile}</p>
                </div>
              ),
            },
            {
              key: 'plan',
              header: 'Plan',
              secondary: true,
              render: (row) => <span className="text-content-muted">{row.plan_name}</span>,
            },
            {
              key: 'seat',
              header: 'Seat / Batch',
              secondary: true,
              render: (row) => (
                <span className="text-content-muted">
                  {row.seat_number ?? '—'}
                  {row.batch_name ? ` · ${row.batch_name}` : ''}
                </span>
              ),
            },
            {
              key: 'period',
              header: 'Valid until',
              align: 'right',
              render: (row) => (
                <span className="tabular-nums">{formatDate(row.end_date)}</span>
              ),
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
