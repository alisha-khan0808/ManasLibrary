import { describe, expect, it } from 'vitest';
import { InvoiceStatus } from '@manas/shared';
import {
  assertPaymentAllowed,
  calculateBalance,
  calculateInvoiceTotals,
  deriveInvoiceStatus,
  InvoiceRuleError,
} from '../src/domain/invoice';

describe('calculateInvoiceTotals', () => {
  it('sums line items into a subtotal and applies discount and tax', () => {
    const totals = calculateInvoiceTotals(
      [
        { description: 'Quarterly membership', quantity: 1, unitPrice: '4500.00' },
        { description: 'Locker', quantity: 3, unitPrice: '150.00' },
      ],
      '500.00',
      '90.00',
    );

    expect(totals.subtotal).toBe('4950.00');
    expect(totals.discount).toBe('500.00');
    expect(totals.tax).toBe('90.00');
    expect(totals.total).toBe('4540.00');
  });

  it('rejects a discount larger than the subtotal', () => {
    expect(() =>
      calculateInvoiceTotals(
        [{ description: 'Monthly', quantity: 1, unitPrice: '1000.00' }],
        '1500.00',
      ),
    ).toThrow(InvoiceRuleError);
  });

  it('rejects negative discount or tax', () => {
    expect(() =>
      calculateInvoiceTotals(
        [{ description: 'Monthly', quantity: 1, unitPrice: '1000.00' }],
        '-10.00',
      ),
    ).toThrow(InvoiceRuleError);
  });

  it('requires at least one line item', () => {
    expect(() => calculateInvoiceTotals([])).toThrow(InvoiceRuleError);
  });
});

describe('deriveInvoiceStatus', () => {
  const dueDate = '2026-03-10';

  it('is PENDING when nothing is paid and the due date is ahead', () => {
    expect(
      deriveInvoiceStatus({
        total: '1000.00',
        amountPaid: '0.00',
        dueDate,
        today: '2026-03-01',
      }),
    ).toBe(InvoiceStatus.PENDING);
  });

  it('is PARTIALLY_PAID when some money is in and it is not yet due', () => {
    expect(
      deriveInvoiceStatus({
        total: '1000.00',
        amountPaid: '400.00',
        dueDate,
        today: '2026-03-01',
      }),
    ).toBe(InvoiceStatus.PARTIALLY_PAID);
  });

  it('is OVERDUE once the due date passes with a balance outstanding', () => {
    expect(
      deriveInvoiceStatus({
        total: '1000.00',
        amountPaid: '400.00',
        dueDate,
        today: '2026-03-11',
      }),
    ).toBe(InvoiceStatus.OVERDUE);
  });

  it('is PAID when the full amount is in, even after the due date', () => {
    expect(
      deriveInvoiceStatus({
        total: '1000.00',
        amountPaid: '1000.00',
        dueDate,
        today: '2026-04-01',
      }),
    ).toBe(InvoiceStatus.PAID);
  });

  it('is not overdue on the due date itself', () => {
    expect(
      deriveInvoiceStatus({
        total: '1000.00',
        amountPaid: '0.00',
        dueDate,
        today: dueDate,
      }),
    ).toBe(InvoiceStatus.PENDING);
  });

  it('keeps CANCELLED regardless of amounts', () => {
    expect(
      deriveInvoiceStatus({
        total: '1000.00',
        amountPaid: '0.00',
        dueDate,
        today: '2026-04-01',
        cancelled: true,
      }),
    ).toBe(InvoiceStatus.CANCELLED);
  });
});

describe('assertPaymentAllowed', () => {
  const base = {
    invoiceStatus: InvoiceStatus.PENDING,
    total: '1000.00',
    amountPaid: '200.00',
  };

  it('allows a payment up to the outstanding balance', () => {
    expect(() => assertPaymentAllowed({ ...base, paymentAmount: '800.00' })).not.toThrow();
    expect(() => assertPaymentAllowed({ ...base, paymentAmount: '1.00' })).not.toThrow();
  });

  it('rejects a payment that exceeds the balance', () => {
    expect(() => assertPaymentAllowed({ ...base, paymentAmount: '800.01' })).toThrow(
      /exceeds the outstanding balance/,
    );
  });

  it('rejects payment against a cancelled invoice', () => {
    expect(() =>
      assertPaymentAllowed({
        ...base,
        invoiceStatus: InvoiceStatus.CANCELLED,
        paymentAmount: '10.00',
      }),
    ).toThrow(/cancelled invoice/);
  });

  it('rejects payment against a fully paid invoice', () => {
    expect(() =>
      assertPaymentAllowed({
        invoiceStatus: InvoiceStatus.PAID,
        total: '1000.00',
        amountPaid: '1000.00',
        paymentAmount: '10.00',
      }),
    ).toThrow(/already been paid/);
  });

  it('rejects a zero or negative payment', () => {
    expect(() => assertPaymentAllowed({ ...base, paymentAmount: '0.00' })).toThrow();
  });
});

describe('calculateBalance', () => {
  it('is total minus amount paid', () => {
    expect(calculateBalance('4540.00', '1540.00')).toBe('3000.00');
  });
});
