import type { Metadata } from 'next';
import Link from 'next/link';
import type { PaginationMeta } from '@manas/shared';
import { getAccessToken } from '@/lib/supabase/server';
import { IS_DEMO_MODE } from '@/lib/demo/config';
import { resolveDemoRequest } from '@/lib/demo/resolver';
import { Card, PageHeader, StatCard } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { DateFilter, FilterBar, FilterSelect, Pagination } from '@/components/ui/Filters';
import { formatDate, formatMoney } from '@/lib/format';
import { RunRemindersButton } from './RunRemindersButton';

export const metadata: Metadata = { title: 'Fees' };

interface FeeRow {
  id: string;
  branch_id: string;
  student_id: string;
  invoice_id: string | null;
  amount: string;
  due_date: string;
  status: string;
  student_name: string;
  student_code: string;
  student_mobile: string;
  invoice_number: string | null;
  invoice_balance: string | null;
}

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');

async function fetchFees(query: Record<string, string | undefined>) {
  if (IS_DEMO_MODE) {
    const resolved = resolveDemoRequest('/fees', query)!;
    return {
      data: resolved.data as FeeRow[],
      meta: resolved.meta,
      totals: (resolved.totals ?? { outstanding: '0.00', overdue: '0.00' }) as {
        outstanding: string;
        overdue: string;
      },
      error: null as string | null,
    };
  }

  const token = await getAccessToken();
  const url = new URL(`${API_URL}/api/v1/fees`);

  for (const [key, value] of Object.entries(query)) {
    if (value) url.searchParams.set(key, value);
  }

  try {
    const response = await fetch(url.toString(), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      cache: 'no-store',
    });
    const body = await response.json();

    if (!response.ok || body.success === false) {
      return {
        data: [] as FeeRow[],
        meta: undefined as PaginationMeta | undefined,
        totals: { outstanding: '0.00', overdue: '0.00' },
        error: body?.error?.message ?? 'Could not load fees.',
      };
    }

    return {
      data: body.data as FeeRow[],
      meta: body.meta as PaginationMeta | undefined,
      totals: (body.totals ?? { outstanding: '0.00', overdue: '0.00' }) as {
        outstanding: string;
        overdue: string;
      },
      error: null as string | null,
    };
  } catch {
    return {
      data: [] as FeeRow[],
      meta: undefined as PaginationMeta | undefined,
      totals: { outstanding: '0.00', overdue: '0.00' },
      error: 'Could not reach the server.',
    };
  }
}

export default async function FeesPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const page = Number.parseInt(searchParams.page ?? '1', 10);

  const result = await fetchFees({
    page: String(page),
    pageSize: '25',
    branchId: searchParams.branchId,
    status: searchParams.status,
    from: searchParams.from,
    to: searchParams.to,
  });

  const meta: PaginationMeta = result.meta ?? { page, pageSize: 25, total: 0, totalPages: 0 };

  return (
    <>
      <PageHeader
        title="Fees & reminders"
        description="Fee status is derived from invoices — it updates as the calendar moves, with no nightly rewrite."
        action={<RunRemindersButton />}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Outstanding in view"
          accent="amber"
          icon="clock"
          value={formatMoney(result.totals.outstanding)}
          tone="warning"
        />
        <StatCard
          label="Overdue in view"
          accent="rose"
          icon="alert"
          value={formatMoney(result.totals.overdue)}
          tone="danger"
        />
        <StatCard label="Fee records" value={meta.total} accent="blue" icon="invoice" />
      </div>

      <div className="mt-6">
        <FilterBar>
          <FilterSelect
            paramName="status"
            label="Status"
            options={[
              { value: 'UPCOMING', label: 'Upcoming' },
              { value: 'DUE', label: 'Due' },
              { value: 'OVERDUE', label: 'Overdue' },
              { value: 'PAID', label: 'Paid' },
              { value: 'CANCELLED', label: 'Cancelled' },
            ]}
          />
          <DateFilter paramName="from" label="Due from" />
          <DateFilter paramName="to" label="Due to" />
        </FilterBar>
      </div>

      <Card padded={false}>
        <DataTable
          rows={result.data}
          rowKey={(row) => row.id}
          error={result.error}
          caption="Fee schedules"
          emptyTitle="No fees in this view"
          emptyDescription="Fee records are created alongside each invoice."
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
                    {row.student_name}
                  </Link>
                  <p className="text-xs text-content-subtle">{row.student_mobile}</p>
                </div>
              ),
            },
            {
              key: 'invoice',
              header: 'Invoice',
              secondary: true,
              render: (row) =>
                row.invoice_id ? (
                  <Link
                    href={`/invoices/${row.invoice_id}`}
                    className="tabular-nums text-brand hover:underline"
                  >
                    {row.invoice_number}
                  </Link>
                ) : (
                  <span className="text-content-subtle">—</span>
                ),
            },
            {
              key: 'due',
              header: 'Due date',
              render: (row) => (
                <span className="tabular-nums">{formatDate(row.due_date)}</span>
              ),
            },
            {
              key: 'amount',
              header: 'Amount',
              align: 'right',
              render: (row) => <span className="tabular-nums">{formatMoney(row.amount)}</span>,
            },
            {
              key: 'balance',
              header: 'Balance',
              align: 'right',
              render: (row) => (
                <span
                  className={
                    Number(row.invoice_balance ?? 0) > 0
                      ? 'tabular-nums font-medium text-warning'
                      : 'tabular-nums'
                  }
                >
                  {formatMoney(row.invoice_balance ?? '0.00')}
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
