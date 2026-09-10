import type { Metadata } from 'next';
import Link from 'next/link';
import type { PaginationMeta, Student } from '@manas/shared';
import { apiFetchSafe } from '@/lib/api';
import { Card, PageHeader } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';
import { FilterBar, FilterSelect, Pagination, SearchInput } from '@/components/ui/Filters';
import { formatDate, initials } from '@/lib/format';

export const metadata: Metadata = { title: 'Students' };

type StudentRow = Student & { branch_name: string };

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const page = Number.parseInt(searchParams.page ?? '1', 10);

  const result = await apiFetchSafe<StudentRow[]>(
    '/students',
    {
      query: {
        page,
        pageSize: 20,
        search: searchParams.search,
        branchId: searchParams.branchId,
        status: searchParams.status,
        sortBy: 'created_at',
        sortDir: 'desc',
      },
    },
    [],
  );

  const meta: PaginationMeta = result.meta ?? {
    page,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  };

  return (
    <>
      <PageHeader
        title="Students"
        description="Everyone enrolled at the branches you can access."
        action={
          <Link href="/students/new">
            <Button>Add student</Button>
          </Link>
        }
      />

      <FilterBar>
        <SearchInput placeholder="Name, mobile, code or email…" />
        <FilterSelect
          paramName="status"
          label="Status"
          options={[
            { value: 'ACTIVE', label: 'Active' },
            { value: 'INACTIVE', label: 'Inactive' },
            { value: 'EXPIRED', label: 'Expired' },
            { value: 'SUSPENDED', label: 'Suspended' },
          ]}
        />
      </FilterBar>

      <Card padded={false}>
        <DataTable
          rows={result.data}
          rowKey={(row) => row.id}
          error={result.error}
          caption="Students"
          emptyTitle={searchParams.search ? 'No students match your search' : 'No students yet'}
          emptyDescription={
            searchParams.search
              ? 'Try a different name, mobile number or student code.'
              : 'Add your first student, or process an admission to create one automatically.'
          }
          emptyAction={
            !searchParams.search ? (
              <Link href="/students/new">
                <Button size="sm">Add student</Button>
              </Link>
            ) : undefined
          }
          // A student row has an obvious identity, so on a phone it reads as
          // name-first with supporting detail rather than as labelled fields.
          mobileRow={(row) => (
            <Link
              href={`/students/${row.id}`}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-sunken"
            >
              <span
                aria-hidden
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-sm font-semibold text-brand"
              >
                {initials(row.full_name)}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-content">
                  {row.full_name}
                </span>
                <span className="block truncate text-xs text-content-subtle">
                  {row.student_code}
                </span>
                <span className="block truncate text-xs text-content-muted">
                  M: {row.mobile}
                </span>
              </span>

              <span className="flex shrink-0 flex-col items-end gap-1">
                <StatusBadge status={row.status} />
                <span className="text-[11px] text-content-subtle">
                  {formatDate(row.created_at)}
                </span>
              </span>

              <span aria-hidden className="shrink-0 text-content-subtle">
                ›
              </span>
            </Link>
          )}
          columns={[
            {
              key: 'name',
              header: 'Student',
              render: (row) => (
                <div className="min-w-0">
                  <Link
                    href={`/students/${row.id}`}
                    className="font-medium text-brand hover:underline"
                  >
                    {row.full_name}
                  </Link>
                  <p className="text-xs text-content-subtle">{row.student_code}</p>
                </div>
              ),
            },
            {
              key: 'mobile',
              header: 'Mobile',
              render: (row) => <span className="tabular-nums">{row.mobile}</span>,
            },
            {
              key: 'branch',
              header: 'Branch',
              secondary: true,
              render: (row) => (
                <span className="text-content-muted">{row.branch_name}</span>
              ),
            },
            {
              key: 'joined',
              header: 'Joined',
              secondary: true,
              render: (row) => (
                <span className="tabular-nums text-content-muted">
                  {formatDate(row.created_at)}
                </span>
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
