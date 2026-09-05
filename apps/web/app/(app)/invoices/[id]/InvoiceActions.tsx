'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Permission, type Invoice } from '@manas/shared';
import { api, ApiClientError } from '@/lib/api-client';
import { useSession } from '@/components/SessionProvider';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { InputField, SelectField, TextareaField } from '@/components/ui/Field';
import { formatMoney, todayIso } from '@/lib/format';

export function InvoiceActions({ invoice }: { invoice: Invoice }) {
  const { can } = useSession();
  const router = useRouter();
  const toast = useToast();

  const [payOpen, setPayOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [amount, setAmount] = useState(invoice.balance);
  const [method, setMethod] = useState('CASH');
  const [reference, setReference] = useState('');
  const [paymentDate, setPaymentDate] = useState(todayIso());
  const [reason, setReason] = useState('');

  const settled = Number(invoice.balance) <= 0;
  const cancelled = invoice.status === 'CANCELLED';
  const canPay = can(Permission.PAYMENT_RECORD) && !settled && !cancelled;
  const canCancel =
    can(Permission.INVOICE_MANAGE) && !cancelled && Number(invoice.amount_paid) === 0;

  async function recordPayment() {
    setLoading(true);
    setError(null);

    try {
      const result = await api.post('/payments', {
        invoice_id: invoice.id,
        amount,
        payment_method: method,
        transaction_reference: reference || null,
        payment_date: paymentDate,
      });

      toast.success(result.message);
      setPayOpen(false);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : 'Could not reach the server. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  }

  async function cancelInvoice() {
    setLoading(true);
    setError(null);

    try {
      const result = await api.post(`/invoices/${invoice.id}/cancel`, { reason });
      toast.success(result.message);
      setCancelOpen(false);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : 'Could not reach the server. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {canPay && <Button onClick={() => setPayOpen(true)}>Record payment</Button>}
      {canCancel && (
        <Button variant="secondary" onClick={() => setCancelOpen(true)}>
          Cancel invoice
        </Button>
      )}

      <Modal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title="Record payment"
        description={`Outstanding balance: ${formatMoney(invoice.balance)}`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPayOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button onClick={recordPayment} loading={loading}>
              Record payment
            </Button>
          </>
        }
      >
        {error && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger"
          >
            {error}
          </div>
        )}

        <div className="space-y-4">
          <InputField
            label="Amount"
            inputMode="decimal"
            required
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            hint="Cannot exceed the outstanding balance."
          />
          <SelectField
            label="Method"
            value={method}
            onChange={(event) => setMethod(event.target.value)}
            options={[
              { value: 'CASH', label: 'Cash' },
              { value: 'UPI', label: 'UPI' },
              { value: 'BANK_TRANSFER', label: 'Bank transfer' },
              { value: 'CARD', label: 'Card' },
              { value: 'OTHER', label: 'Other' },
            ]}
          />
          <InputField
            label="Payment date"
            type="date"
            value={paymentDate}
            onChange={(event) => setPaymentDate(event.target.value)}
          />
          <InputField
            label="Transaction reference"
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            hint="Optional. UPI reference, cheque number, etc."
          />
        </div>
      </Modal>

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancel this invoice"
        description="A cancelled invoice can no longer receive payments. This cannot be undone."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelOpen(false)} disabled={loading}>
              Keep invoice
            </Button>
            <Button
              variant="danger"
              onClick={cancelInvoice}
              loading={loading}
              disabled={reason.trim().length < 3}
            >
              Cancel invoice
            </Button>
          </>
        }
      >
        {error && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger"
          >
            {error}
          </div>
        )}

        <TextareaField
          label="Reason"
          required
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          hint="Recorded in the audit log and appended to the invoice notes."
        />
      </Modal>
    </>
  );
}
