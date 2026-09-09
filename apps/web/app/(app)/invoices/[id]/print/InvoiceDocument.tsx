import type { Branch, Invoice, InvoiceItem, Payment, Student } from '@manas/shared';
import { formatDate, formatMoney } from '@/lib/format';

/**
 * The printable invoice.
 *
 * Laid out as a business document rather than an admin screen: issuer top
 * left, document meta top right, billing block, line items, then a totals
 * ladder in the bottom right. Deliberately plain — borders and greys survive
 * a monochrome printer, where the console's accent tints would turn to mud.
 *
 * Every figure comes from the API. Nothing is recomputed here; `total` and
 * `balance` are generated columns in Postgres, and a printed invoice that
 * disagreed with the database would be worse than no invoice at all.
 */
export function InvoiceDocument({
  invoice,
  items,
  payments,
  student,
  branch,
}: {
  invoice: Invoice;
  items: InvoiceItem[];
  payments: Array<Payment & { recorded_by_name: string | null }>;
  student: Pick<Student, 'id' | 'full_name' | 'student_code' | 'mobile' | 'email' | 'address'>;
  branch: Pick<
    Branch,
    'id' | 'name' | 'branch_code' | 'address' | 'city' | 'state' | 'phone' | 'email'
  >;
}) {
  const settled = Number(invoice.balance) <= 0;

  return (
    <article className="invoice-sheet print-keep-color mx-auto w-full max-w-[820px] bg-white p-8 text-[13px] leading-relaxed text-slate-900 print:p-0">
      {/* ---------------------------------------------------------------
          Header: issuer on the left, document meta on the right.
          --------------------------------------------------------------- */}
      <header className="flex flex-wrap items-start justify-between gap-6 print:gap-4">
        <div className="min-w-0">
          <h1 className="text-lg font-bold tracking-tight text-slate-900">{branch.name}</h1>
          <div className="mt-1 space-y-0.5 text-slate-600">
            {branch.address && <p>{branch.address}</p>}
            {(branch.city || branch.state) && (
              <p>{[branch.city, branch.state].filter(Boolean).join(', ')}</p>
            )}
            {branch.phone && <p>Phone: {branch.phone}</p>}
            {branch.email && <p>{branch.email}</p>}
            <p className="text-slate-500">Branch code: {branch.branch_code}</p>
          </div>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-3xl font-bold tracking-tight text-slate-400 print:text-2xl">INVOICE</p>
          <table className="mt-3 ml-auto text-[12px] print:mt-2">
            <tbody>
              <MetaRow label="DATE" value={formatDate(invoice.invoice_date)} />
              <MetaRow label="INVOICE #" value={invoice.invoice_number} />
              <MetaRow label="DUE DATE" value={formatDate(invoice.due_date)} />
              <MetaRow label="STUDENT ID" value={student.student_code} />
            </tbody>
          </table>
        </div>
      </header>

      {/* ---------------------------------------------------------------
          Billing block.
          --------------------------------------------------------------- */}
      <section className="mt-8 grid gap-6 sm:grid-cols-2 print:mt-5 print:gap-4">
        <div>
          <h2 className="bg-slate-800 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-white">
            Bill to
          </h2>
          <div className="mt-2 space-y-0.5 px-1">
            <p className="font-semibold">{student.full_name}</p>
            <p className="text-slate-600">{student.student_code}</p>
            {student.address && <p className="text-slate-600">{student.address}</p>}
            <p className="text-slate-600">{student.mobile}</p>
            {student.email && <p className="text-slate-600">{student.email}</p>}
          </div>
        </div>

        <div>
          <h2 className="bg-slate-800 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-white">
            Status
          </h2>
          <div className="mt-2 space-y-0.5 px-1">
            <p className="font-semibold">{invoice.status.replace('_', ' ')}</p>
            <p className="text-slate-600">
              {settled
                ? 'Paid in full — no action required.'
                : `Balance outstanding: ${formatMoney(invoice.balance)}`}
            </p>
            {invoice.notes && <p className="mt-1 text-slate-600">{invoice.notes}</p>}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------
          Line items.
          --------------------------------------------------------------- */}
      <table className="mt-8 w-full border-collapse text-[12px] print:mt-5">
        <thead>
          <tr className="bg-slate-800 text-white">
            <Th className="w-[52%] text-left">Description</Th>
            <Th className="text-right">Qty</Th>
            <Th className="text-right">Unit price</Th>
            <Th className="text-right">Amount</Th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-slate-200">
              <Td>{item.description}</Td>
              <Td className="text-right tabular-nums">{item.quantity}</Td>
              <Td className="text-right tabular-nums">{formatMoney(item.unit_price)}</Td>
              <Td className="text-right tabular-nums">{formatMoney(item.amount)}</Td>
            </tr>
          ))}

          {/* Keeps the table a consistent height on a short invoice, the way a
              printed form has ruled blank lines. */}
          {Array.from({ length: Math.max(0, 4 - items.length) }).map((_, i) => (
            <tr key={`filler-${i}`} className="border-b border-slate-200">
              <Td>&nbsp;</Td>
              <Td />
              <Td />
              <Td />
            </tr>
          ))}
        </tbody>
      </table>

      {/* ---------------------------------------------------------------
          Totals ladder.
          --------------------------------------------------------------- */}
      <section className="print-avoid-break mt-4 flex justify-end print:mt-3">
        <table className="w-[280px] text-[12px]">
          <tbody>
            <TotalRow label="Subtotal" value={formatMoney(invoice.subtotal)} />
            {Number(invoice.discount) > 0 && (
              <TotalRow label="Discount" value={`− ${formatMoney(invoice.discount)}`} />
            )}
            <TotalRow label="Tax" value={formatMoney(invoice.tax)} />
            <tr className="border-t-2 border-slate-800">
              <td className="py-2 font-bold uppercase tracking-wide">Total</td>
              <td className="py-2 text-right font-bold tabular-nums">
                {formatMoney(invoice.total)}
              </td>
            </tr>
            <TotalRow label="Amount paid" value={formatMoney(invoice.amount_paid)} />
            <tr className="bg-slate-100">
              <td className="px-2 py-2 font-bold uppercase tracking-wide">Balance due</td>
              <td className="px-2 py-2 text-right font-bold tabular-nums">
                {formatMoney(invoice.balance)}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* ---------------------------------------------------------------
          Receipts. A paid invoice doubles as proof of payment, so the
          receipts belong on the document rather than only on screen.
          --------------------------------------------------------------- */}
      {payments.length > 0 && (
        <section className="print-avoid-break mt-8 print:mt-5">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Payments received
          </h2>
          <table className="mt-2 w-full border-collapse text-[12px]">
            <thead>
              <tr className="border-y border-slate-300 text-slate-600">
                <Th className="text-left font-medium">Date</Th>
                <Th className="text-left font-medium">Method</Th>
                <Th className="text-left font-medium">Reference</Th>
                <Th className="text-right font-medium">Amount</Th>
              </tr>
            </thead>
            <tbody>
              {payments.slice(0, 5).map((payment) => (
                <tr key={payment.id} className="border-b border-slate-200">
                  <Td>{formatDate(payment.payment_date)}</Td>
                  <Td>{payment.payment_method.replace('_', ' ')}</Td>
                  <Td>{payment.transaction_reference ?? '—'}</Td>
                  <Td className="text-right tabular-nums">{formatMoney(payment.amount)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
          {payments.length > 5 && (
            <p className="mt-1 text-[11px] text-slate-500">
              Showing the 5 most recent of {payments.length} payments. The totals above
              include all of them.
            </p>
          )}
        </section>
      )}

      {/* ---------------------------------------------------------------
          Footer.
          --------------------------------------------------------------- */}
      <footer className="print-avoid-break mt-10 border-t border-slate-300 pt-4 text-center text-[11px] text-slate-600 print:mt-5 print:pt-3">
        <p>
          Payments are accepted at the branch counter. Please quote invoice{' '}
          <span className="font-semibold text-slate-800">{invoice.invoice_number}</span> when
          paying.
        </p>
        {(branch.phone || branch.email) && (
          <p className="mt-1">
            Questions about this invoice? Contact {branch.name}
            {branch.phone ? ` · ${branch.phone}` : ''}
            {branch.email ? ` · ${branch.email}` : ''}
          </p>
        )}
        <p className="mt-3 font-semibold text-slate-800">Thank you for studying with us.</p>
      </footer>
    </article>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td className="pr-3 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </td>
      <td className="min-w-[130px] border border-slate-300 px-2 py-1 text-right tabular-nums">
        {value}
      </td>
    </tr>
  );
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <tr className="border-b border-slate-200">
      <td className="py-1.5 text-slate-600 print:py-1">{label}</td>
      <td className="py-1.5 text-right tabular-nums print:py-1">{value}</td>
    </tr>
  );
}

function Th({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={`px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider print:py-1 ${className}`}
    >
      {children}
    </th>
  );
}

function Td({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return <td className={`px-2 py-1.5 align-top print:py-1 ${className}`}>{children}</td>;
}
