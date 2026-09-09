import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import type { Branch, Invoice, InvoiceItem, Payment, Student } from '@manas/shared';
import { apiFetch, ApiRequestError } from '@/lib/api';
import { InvoiceDocument } from './InvoiceDocument';
import { PrintButton } from './PrintButton';

export const metadata: Metadata = { title: 'Print invoice' };

interface InvoiceDetail {
  invoice: Invoice;
  items: InvoiceItem[];
  payments: Array<Payment & { recorded_by_name: string | null }>;
  student: Pick<Student, 'id' | 'full_name' | 'student_code' | 'mobile' | 'email' | 'address'>;
  branch: Pick<
    Branch,
    'id' | 'name' | 'branch_code' | 'address' | 'city' | 'state' | 'phone' | 'email'
  >;
}

export default async function InvoicePrintPage({ params }: { params: { id: string } }) {
  let detail: InvoiceDetail;

  try {
    const result = await apiFetch<InvoiceDetail>(`/invoices/${params.id}`);
    detail = result.data;
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) notFound();
    throw error;
  }

  return (
    <>
      {/* useSearchParams needs a Suspense boundary during prerender. */}
      <Suspense fallback={null}>
        <PrintButton invoiceNumber={detail.invoice.invoice_number} />
      </Suspense>

      {/* On screen the document sits on a sheet so the layout is obvious
          before printing; on paper the frame disappears. */}
      <div className="print-root rounded-card border border-border bg-white shadow-card print:rounded-none print:border-0 print:shadow-none">
        <InvoiceDocument {...detail} />
      </div>
    </>
  );
}
