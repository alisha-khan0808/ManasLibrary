import type { Metadata } from 'next';
import Link from 'next/link';
import type { PaginationMeta, Payment } from '@manas/shared';
import { getAccessToken } from '@/lib/supabase/server';
import { Card, PageHeader, StatCard } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { DateFilter, FilterBar, FilterSelect, Pagination } from '@/components/ui/Filters';
import { formatDate, formatMoney } from '@/lib/format';
import { PaymentRowActions } from './PaymentRowActions';

export const metadata: Metadata = { title: 'Payments' };

type PaymentRow = Payment & {
  student_name: string;
  student_code: string;
  invoice_number: string;
  recorded_by_name: string | null;
};

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');

/**
 * The payments list carries a `totals` field alongside the standard envelope,
 * so it is fetched directly rather than through the generic helper.
 */
async function fetchPayments(query: Record<string, string | undefined>) {
  const token = await getAccessToken();
  const url = new URL(`${API_URL}/api/v1/payments`);

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
        data: [] as PaymentRow[],
        meta: undefined as PaginationMeta | undefined,
        totals: { collected: '0.00' },
        error: body?.error?.message ?? 'Could not load payments.',
      };
    }

    return {
      data: body.data as PaymentRow[],
      meta: body.meta as PaginationMeta | undefined,
      totals: (body.totals ?? { collected: '0.00' }) as { collected: string },
      error: null as string | null,
    };
  } catch {
    return {
      data: [] as PaymentRow[],
      meta: undefined as PaginationMeta | undefined,
      totals: { collected: '0.00' },
      error: 'Could not reach the server.',
    };
  }
}

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const page = Number.parseInt(searchParams.page ?? '1', 10);

  const result = await fetchPayments({
    page: String(page),
    pageSize: '25',
    branchId: searchParams.branchId,
    method: searchParams.method,
    from: searchParams.from,
    to: searchParams.to,
  });

  const meta: PaginationMeta = result.meta ?? { page, pageSize: 25, total: 0, totalPages: 0 };

  return (
    <>
      <PageHeader
        title="Payments"
        description="Every receipt and reversal, in the order it was recorded."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Collected in this view"
          value={formatMoney(result.totals.collected)}
          tone="positive"
          hint="Net of reversals"
        />
        <StatCard label="Transactions" value={meta.total} />
        <StatCard
          label="Range"
          value={
            searchParams.from || searchParams.to
              ? `${searchParams.from ?? '…'} → ${searchParams.to ?? '…'}`
              : 'All time'
          }
        />
      </div>

      <div className="mt-6">
        <FilterBar>
          <FilterSelect
            paramName="method"
            label="Method"
            options={[
              { value: 'CASH', label: 'Cash' },
              { value: 'UPI', label: 'UPI' },
              { value: 'BANK_TRANSFER', label: 'Bank transfer' },
              { value: 'CARD', label: 'Card' },
              { value: 'OTHER', label: 'Other' },
            ]}
          />
          <DateFilter paramName="from" label="From" />
          <DateFilter paramName="to" label="To" />
        </FilterBar>
      </div>

      <Card padded={false}>
        <DataTable
          rows={result.data}
          rowKey={(row) => row.id}
          error={result.error}
          caption="Payments"
          emptyTitle="No payments recorded"
          emptyDescription="Payments show up here as soon as they are collected."
          columns={[
            {
              key: 'date',
              header: 'Date',
              render: (row) => (
                <span className="tabular-nums">{formatDate(row.payment_date)}</span>
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
              key: 'invoice',
              header: 'Invoice',
              secondary: true,
              render: (row) => (
                <Link
                  href={`/invoices/${row.invoice_id}`}
                  className="tabular-nums text-brand hover:underline"
                >
                  {row.invoice_number}
                </Link>
              ),
            },
            {
              key: 'method',
              header: 'Method',
              secondary: true,
              render: (row) => <StatusBadge status={row.payment_method} tone="neutral" />,
            },
            {
              key: 'by',
              header: 'Recorded by',
              secondary: true,
              render: (row) => (
                <span className="text-content-muted">{row.recorded_by_name ?? '—'}</span>
              ),
            },
            {
              key: 'amount',
              header: 'Amount',
              align: 'right',
              render: (row) => (
                <span
                  className={
                    Number(row.amount) < 0
                      ? 'tabular-nums font-medium text-danger'
                      : 'tabular-nums font-medium text-positive'
                  }
                >
                  {formatMoney(row.amount)}
                </span>
              ),
            },
            {
              key: 'actions',
              header: '',
              align: 'right',
              render: (row) => <PaymentRowActions payment={row} />,
            },
          ]}
        />
        <Pagination {...meta} />
      </Card>
    </>
  );
}
