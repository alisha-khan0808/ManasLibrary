import type { Metadata } from 'next';
import Link from 'next/link';
import type { Branch, PaginationMeta } from '@manas/shared';
import { apiFetchSafe } from '@/lib/api';
import { Card, PageHeader } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { FilterBar, FilterSelect, Pagination, SearchInput } from '@/components/ui/Filters';
import { formatTime } from '@/lib/format';
import { BranchFormDialog } from './BranchFormDialog';

export const metadata: Metadata = { title: 'Branches' };

export default async function BranchesPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const page = Number.parseInt(searchParams.page ?? '1', 10);

  const result = await apiFetchSafe<Branch[]>(
    '/branches',
    {
      query: {
        page,
        pageSize: 20,
        search: searchParams.search,
        status: searchParams.status,
      },
    },
    [],
  );

  const meta: PaginationMeta = result.meta ?? { page, pageSize: 20, total: 0, totalPages: 0 };

  return (
    <>
      <PageHeader
        title="Branches"
        description="Every branch in the franchise. Inactive branches cannot take new admissions."
        action={<BranchFormDialog />}
      />

      <FilterBar>
        <SearchInput placeholder="Name, code or city…" />
        <FilterSelect
          paramName="status"
          label="Status"
          options={[
            { value: 'ACTIVE', label: 'Active' },
            { value: 'INACTIVE', label: 'Inactive' },
            { value: 'SUSPENDED', label: 'Suspended' },
          ]}
        />
      </FilterBar>

      <Card padded={false}>
        <DataTable
          rows={result.data}
          rowKey={(row) => row.id}
          error={result.error}
          caption="Branches"
          emptyTitle="No branches yet"
          emptyDescription="Create the first branch to start onboarding students."
          columns={[
            {
              key: 'name',
              header: 'Branch',
              render: (row) => (
                <div>
                  <Link
                    href={`/branches/${row.id}`}
                    className="font-medium text-brand hover:underline"
                  >
                    {row.name}
                  </Link>
                  <p className="text-xs text-content-subtle">{row.branch_code}</p>
                </div>
              ),
            },
            {
              key: 'location',
              header: 'Location',
              secondary: true,
              render: (row) => (
                <span className="text-content-muted">
                  {[row.city, row.state].filter(Boolean).join(', ') || '—'}
                </span>
              ),
            },
            {
              key: 'contact',
              header: 'Contact',
              secondary: true,
              render: (row) => (
                <span className="text-content-muted">{row.phone ?? row.email ?? '—'}</span>
              ),
            },
            {
              key: 'hours',
              header: 'Hours',
              secondary: true,
              render: (row) => (
                <span className="tabular-nums text-content-muted">
                  {row.opening_time
                    ? `${formatTime(row.opening_time)}–${formatTime(row.closing_time)}`
                    : '—'}
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
