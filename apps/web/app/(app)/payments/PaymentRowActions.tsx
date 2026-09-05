'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Permission, type Payment } from '@manas/shared';
import { api, ApiClientError } from '@/lib/api-client';
import { useSession } from '@/components/SessionProvider';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { TextareaField } from '@/components/ui/Field';
import { formatMoney } from '@/lib/format';

export function PaymentRowActions({ payment }: { payment: Payment }) {
  const { can } = useSession();
  const router = useRouter();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Reversal entries and already-reversed receipts cannot be reversed again.
  const reversible =
    can(Permission.PAYMENT_REVERSE) &&
    payment.status !== 'REVERSED' &&
    !payment.reverses_payment_id;

  if (!reversible) return null;

  async function reverse() {
    setLoading(true);
    setError(null);

    try {
      const result = await api.post(`/payments/${payment.id}/reverse`, { reason });
      toast.success(result.message);
      setOpen(false);
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
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Reverse
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Reverse this payment"
        description={`A compensating entry of −${formatMoney(payment.amount)} will be recorded. The original stays in the ledger.`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={reverse}
              loading={loading}
              disabled={reason.trim().length < 3}
            >
              Reverse payment
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
          hint="Recorded in the audit log."
        />
      </Modal>
    </>
  );
}
