import { InvoiceStatus } from '@manas/shared';
import { addMoney, compareMoney, multiplyMoney, subtractMoney, sumMoney } from './money';

export interface InvoiceLineInput {
  description: string;
  quantity: number;
  unitPrice: string;
}

export interface InvoiceTotals {
  subtotal: string;
  discount: string;
  tax: string;
  total: string;
}

export class InvoiceRuleError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Recomputes invoice money from the line items. The frontend may display a
 * preview, but this is the only calculation that is ever persisted (PRD §39).
 */
export function calculateInvoiceTotals(
  lines: InvoiceLineInput[],
  discount = '0.00',
  tax = '0.00',
): InvoiceTotals {
  if (lines.length === 0) {
    throw new InvoiceRuleError('VALIDATION_ERROR', 'An invoice needs at least one line item.');
  }

  const subtotal = sumMoney(lines.map((line) => multiplyMoney(line.unitPrice, line.quantity)));

  if (compareMoney(discount, '0.00') < 0 || compareMoney(tax, '0.00') < 0) {
    throw new InvoiceRuleError('VALIDATION_ERROR', 'Discount and tax cannot be negative.');
  }

  if (compareMoney(discount, subtotal) > 0) {
    throw new InvoiceRuleError(
      'VALIDATION_ERROR',
      'Discount cannot be greater than the invoice subtotal.',
    );
  }

  return {
    subtotal,
    discount,
    tax,
    total: addMoney(subtractMoney(subtotal, discount), tax),
  };
}

/**
 * Derives invoice status from trusted amounts. Never accept a status from the
 * client — CANCELLED is the one state only an explicit action can set, so it
 * is passed in rather than inferred.
 */
export function deriveInvoiceStatus(params: {
  total: string;
  amountPaid: string;
  dueDate: string;
  today: string;
  cancelled?: boolean;
}): InvoiceStatus {
  if (params.cancelled) return InvoiceStatus.CANCELLED;

  const paidVsTotal = compareMoney(params.amountPaid, params.total);

  if (paidVsTotal >= 0) return InvoiceStatus.PAID;

  const overdue = params.dueDate < params.today;

  if (compareMoney(params.amountPaid, '0.00') > 0) {
    return overdue ? InvoiceStatus.OVERDUE : InvoiceStatus.PARTIALLY_PAID;
  }

  return overdue ? InvoiceStatus.OVERDUE : InvoiceStatus.PENDING;
}

/**
 * Validates a payment against the invoice before anything is written.
 * Overpayment is rejected: the PRD requires an explicit policy before it is
 * allowed, and none has been specified.
 */
export function assertPaymentAllowed(params: {
  invoiceStatus: InvoiceStatus;
  total: string;
  amountPaid: string;
  paymentAmount: string;
}): void {
  if (params.invoiceStatus === InvoiceStatus.CANCELLED) {
    throw new InvoiceRuleError(
      'INVOICE_CANCELLED',
      'A cancelled invoice cannot receive payments.',
    );
  }

  if (compareMoney(params.paymentAmount, '0.00') <= 0) {
    throw new InvoiceRuleError('VALIDATION_ERROR', 'Payment amount must be greater than zero.');
  }

  const balance = subtractMoney(params.total, params.amountPaid);

  if (compareMoney(balance, '0.00') <= 0) {
    throw new InvoiceRuleError(
      'INVOICE_ALREADY_PAID',
      'This invoice has already been paid in full.',
    );
  }

  if (compareMoney(params.paymentAmount, balance) > 0) {
    throw new InvoiceRuleError(
      'OVERPAYMENT_NOT_ALLOWED',
      `Payment exceeds the outstanding balance of ${balance}.`,
    );
  }
}

export function calculateBalance(total: string, amountPaid: string): string {
  return subtractMoney(total, amountPaid);
}
