/**
 * Date helpers. Everything the business cares about is a calendar date, not an
 * instant, so dates are handled as `YYYY-MM-DD` strings throughout. This keeps
 * membership windows, due dates and attendance days free of timezone drift.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class DateError extends Error {}

export function assertIsoDate(value: string, label = 'date'): string {
  if (!ISO_DATE.test(value)) {
    throw new DateError(`Invalid ${label}: expected YYYY-MM-DD, received "${value}"`);
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new DateError(`Invalid ${label}: "${value}" is not a real calendar date`);
  }
  return value;
}

export function today(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  assertIsoDate(date);
  const base = new Date(`${date}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  assertIsoDate(from, 'from date');
  assertIsoDate(to, 'to date');
  const ms =
    new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime();
  return Math.round(ms / 86_400_000);
}

/**
 * A plan of N days starting on the 1st runs through day N inclusive, so a
 * 30-day plan starting 2026-01-01 ends 2026-01-30.
 */
export function membershipEndDate(startDate: string, durationDays: number): string {
  if (!Number.isInteger(durationDays) || durationDays <= 0) {
    throw new DateError(`Plan duration must be a positive whole number of days.`);
  }
  return addDays(startDate, durationDays - 1);
}

export function isBefore(a: string, b: string): boolean {
  return assertIsoDate(a) < assertIsoDate(b);
}

export function rangesOverlap(
  aStart: string,
  aEnd: string | null,
  bStart: string,
  bEnd: string | null,
): boolean {
  // Inclusive bounds, matching the EXCLUDE constraint in migration 0004.
  const aEndValue = aEnd ?? '9999-12-31';
  const bEndValue = bEnd ?? '9999-12-31';
  return aStart <= bEndValue && bStart <= aEndValue;
}
