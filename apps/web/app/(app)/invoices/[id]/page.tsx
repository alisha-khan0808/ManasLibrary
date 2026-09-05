import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Branch, Invoice, InvoiceItem, Payment, Student } from '@manas/shared';
import { apiFetch, ApiRequestError } from '@/lib/api';
import { Card, PageHeader } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatDate, formatMoney } from '@/lib/format';
import { InvoiceActions } from './InvoiceActions';

export const metadata: Metadata = { title: 'Invoice' };

interface InvoiceDetail {
  invoice: Invoice;
  items: InvoiceItem[];
  payments: Array<Payment & { recorded_by_name: string | null }>;
  student: Pick<Student, 'id' | 'full_name' | 'student_code' | 'mobile' | 'email'>;
  branch: Pick<Branch, 'id' | 'name' | 'branch_code' | 'address' | 'city' | 'state' | 'phone' | 'email'>;
}

export default async function InvoiceDetailPage({ params }: { params: { id: string } }) {
  let detail: InvoiceDetail;

  try {
    const result = await apiFetch<InvoiceDetail>(`/invoices/${params.id}`);
    detail = result.data;
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) notFound();
    throw error;
  }

  const { invoice, items, payments, student, branch } = detail;

  return (
    <>
      <PageHeader
        title={invoice.invoice_number}
        description={`Issued ${formatDate(invoice.invoice_date)} · due ${formatDate(invoice.due_date)}`}
        action={
          <>
            <StatusBadge status={invoice.status} />
            <InvoiceActions invoice={invoice} />
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Billed to" className="lg:col-span-2">
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-content-subtle">Student</p>
              <Link
                href={`/students/${student.id}`}
                className="mt-1 block font-medium text-brand hover:underline"
              >
                {student.full_name}
              </Link>
              <p className="text-sm text-content-muted">{student.student_code}</p>
              <p className="text-sm text-content-muted">{student.mobile}</p>
              {student.email && <p className="text-sm text-content-muted">{student.email}</p>}
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-content-subtle">Branch</p>
              <p className="mt-1 font-medium text-content">{branch.name}</p>
              <p className="text-sm text-content-muted">{branch.branch_code}</p>
              {branch.address && <p className="text-sm text-content-muted">{branch.address}</p>}
              {branch.phone && <p className="text-sm text-content-muted">{branch.phone}</p>}
            </div>
          </div>
        </Card>

        <Card title="Summary">
          <dl className="space-y-2.5 text-sm">
            <Row label="Subtotal" value={formatMoney(invoice.subtotal)} />
            <Row label="Discount" value={`− ${formatMoney(invoice.discount)}`} />
            <Row label="Tax" value={formatMoney(invoice.tax)} />
            <div className="flex items-center justify-between border-t border-border pt-2.5">
              <dt className="font-medium text-content">Total</dt>
              <dd className="font-semibold tabular-nums text-content">
                {formatMoney(invoice.total)}
              </dd>
            </div>
            <Row label="Paid" value={formatMoney(invoice.amount_paid)} tone="positive" />
            <div className="flex items-center justify-between border-t border-border pt-2.5 text-base">
              <dt className="font-medium text-content">Balance due</dt>
              <dd
                className={
                  Number(invoice.balance) > 0
                    ? 'font-semibold tabular-nums text-warning'
                    : 'font-semibold tabular-nums text-positive'
                }
              >
                {formatMoney(invoice.balance)}
              </dd>
            </div>
          </dl>
        </Card>
      </div>

      <Card title="Line items" className="mt-6" padded={false}>
        <DataTable
          rows={items}
          rowKey={(row) => row.id}
          emptyTitle="No line items"
          columns={[
            {
              key: 'description',
              header: 'Description',
              render: (row) => <span className="text-content">{row.description}</span>,
            },
            {
              key: 'quantity',
              header: 'Qty',
              align: 'right',
              render: (row) => <span className="tabular-nums">{row.quantity}</span>,
            },
            {
              key: 'unit',
              header: 'Unit price',
              align: 'right',
              render: (row) => (
                <span className="tabular-nums">{formatMoney(row.unit_price)}</span>
              ),
            },
            {
              key: 'amount',
              header: 'Amount',
              align: 'right',
              render: (row) => (
                <span className="tabular-nums font-medium">{formatMoney(row.amount)}</span>
              ),
            },
          ]}
        />
      </Card>

      <Card
        title="Payments"
        description="Reversals appear as negative entries; nothing is ever deleted."
        className="mt-6"
        padded={false}
      >
        <DataTable
          rows={payments}
          rowKey={(row) => row.id}
          emptyTitle="No payments yet"
          emptyDescription="Record a payment to settle this invoice."
          columns={[
            {
              key: 'date',
              header: 'Date',
              render: (row) => (
                <span className="tabular-nums">{formatDate(row.payment_date)}</span>
              ),
            },
            {
              key: 'method',
              header: 'Method',
              render: (row) => <StatusBadge status={row.payment_method} tone="neutral" />,
            },
            {
              key: 'reference',
              header: 'Reference',
              secondary: true,
              render: (row) => (
                <span className="text-content-muted">{row.transaction_reference ?? '—'}</span>
              ),
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
              key: 'status',
              header: 'Status',
              secondary: true,
              render: (row) => <StatusBadge status={row.status} />,
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
          ]}
        />
      </Card>
    </>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'positive';
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-content-muted">{label}</dt>
      <dd
        className={
          tone === 'positive' ? 'tabular-nums text-positive' : 'tabular-nums text-content'
        }
      >
        {value}
      </dd>
    </div>
  );
}
