/**
 * Money handling.
 *
 * `numeric` columns arrive from node-postgres as strings, on purpose: parsing
 * them into IEEE doubles would silently corrupt currency. Every calculation
 * here converts to integer minor units (paise), operates there, and formats
 * back to a fixed two-decimal string.
 */

const SCALE = 100;

export class MoneyError extends Error {}

/** Parses a decimal string / number into integer minor units. */
export function toMinor(value: string | number): number {
  const raw = typeof value === 'number' ? value.toFixed(2) : value.trim();

  if (!/^-?\d+(\.\d+)?$/.test(raw)) {
    throw new MoneyError(`Not a valid monetary amount: ${String(value)}`);
  }

  const negative = raw.startsWith('-');
  const [whole = '0', fraction = ''] = raw.replace('-', '').split('.');
  const paddedFraction = `${fraction}00`.slice(0, 2);

  // Guard against a third decimal place silently disappearing.
  if (fraction.length > 2 && /[1-9]/.test(fraction.slice(2))) {
    throw new MoneyError(
      `Amount ${raw} has more precision than the supported two decimal places.`,
    );
  }

  const minor = Number(whole) * SCALE + Number(paddedFraction);

  if (!Number.isSafeInteger(minor)) {
    throw new MoneyError(`Amount ${raw} is out of the supported range.`);
  }

  return negative ? -minor : minor;
}

/** Formats integer minor units back to a canonical "0.00" string. */
export function toDecimalString(minor: number): string {
  if (!Number.isInteger(minor)) {
    throw new MoneyError(`Minor units must be an integer, received ${minor}`);
  }
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  return `${sign}${Math.floor(abs / SCALE)}.${String(abs % SCALE).padStart(2, '0')}`;
}

export function addMoney(...values: Array<string | number>): string {
  return toDecimalString(values.reduce<number>((sum, v) => sum + toMinor(v), 0));
}

export function subtractMoney(a: string | number, b: string | number): string {
  return toDecimalString(toMinor(a) - toMinor(b));
}

export function multiplyMoney(amount: string | number, quantity: number): string {
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new MoneyError(`Quantity must be a non-negative integer, received ${quantity}`);
  }
  return toDecimalString(toMinor(amount) * quantity);
}

export function compareMoney(a: string | number, b: string | number): -1 | 0 | 1 {
  const left = toMinor(a);
  const right = toMinor(b);
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function isZero(value: string | number): boolean {
  return toMinor(value) === 0;
}

export function isPositive(value: string | number): boolean {
  return toMinor(value) > 0;
}

/** Normalises any accepted input into the canonical string representation. */
export function normalizeMoney(value: string | number): string {
  return toDecimalString(toMinor(value));
}

export function sumMoney(values: Array<string | number>): string {
  return values.length === 0 ? '0.00' : addMoney(...values);
}
