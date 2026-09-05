import type { Metadata } from 'next';
import type { AppUser, PaginationMeta } from '@manas/shared';
import { apiFetchSafe } from '@/lib/api';
import { Card, PageHeader } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { FilterBar, FilterSelect, Pagination, SearchInput } from '@/components/ui/Filters';
import { formatDate } from '@/lib/format';
import { UserFormDialog } from './UserFormDialog';

export const metadata: Metadata = { title: 'Users' };

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const page = Number.parseInt(searchParams.page ?? '1', 10);

  const result = await apiFetchSafe<AppUser[]>(
    '/users',
    {
      query: {
        page,
        pageSize: 20,
        search: searchParams.search,
        role: searchParams.role,
        status: searchParams.status,
        branchId: searchParams.branchId,
      },
    },
    [],
  );

  const meta: PaginationMeta = result.meta ?? { page, pageSize: 20, total: 0, totalPages: 0 };

  return (
    <>
      <PageHeader
        title="Users"
        description="Staff accounts and the branches they may operate on."
        action={<UserFormDialog />}
      />

      <FilterBar>
        <SearchInput placeholder="Name or email…" />
        <FilterSelect
          paramName="role"
          label="Role"
          options={[
            { value: 'SUPER_ADMIN', label: 'Super Admin' },
            { value: 'BRANCH_ADMIN', label: 'Branch Admin' },
            { value: 'STAFF', label: 'Staff' },
          ]}
        />
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
          caption="Users"
          emptyTitle="No users match"
          emptyDescription="Invite a colleague to give them access to a branch."
          columns={[
            {
              key: 'name',
              header: 'User',
              render: (row) => (
                <div>
                  <p className="font-medium text-content">{row.full_name}</p>
                  <p className="text-xs text-content-subtle">{row.email}</p>
                </div>
              ),
            },
            {
              key: 'role',
              header: 'Role',
              render: (row) => (
                <StatusBadge
                  status={row.role}
                  tone={row.role === 'SUPER_ADMIN' ? 'brand' : 'neutral'}
                />
              ),
            },
            {
              key: 'branches',
              header: 'Branches',
              secondary: true,
              render: (row) => (
                <span className="text-content-muted">
                  {row.role === 'SUPER_ADMIN'
                    ? 'All branches'
                    : `${row.branch_ids.length} branch(es)`}
                </span>
              ),
            },
            {
              key: 'created',
              header: 'Added',
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
            {
              key: 'actions',
              header: '',
              align: 'right',
              render: (row) => <UserFormDialog user={row} />,
            },
          ]}
        />
        <Pagination {...meta} />
      </Card>
    </>
  );
}
