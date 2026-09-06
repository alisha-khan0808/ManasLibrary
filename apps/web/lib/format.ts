/** Presentation helpers. Nothing here participates in business calculations. */

const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numberFormat = new Intl.NumberFormat('en-IN');

/** Amounts arrive from the API as decimal strings; parse only to display. */
export function formatMoney(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return currency.format(0);
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? currency.format(parsed) : String(value);
}

export function formatNumber(value: number | null | undefined): string {
  return numberFormat.format(value ?? 0);
}

/**
 * Dates are assembled by hand rather than through `toLocaleDateString`.
 *
 * Locale formatting is not stable across ICU builds — Node renders en-IN as
 * "26-Sept-2026" while Chrome renders "26 Sept 2026" — which makes the server
 * and client markup disagree and throws a React hydration error. Only numeric
 * parts are read from Intl (those are stable); the month name and separators
 * come from the table below.
 */
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/** Timestamps are rendered in one fixed zone so every viewer agrees. */
const DISPLAY_TIME_ZONE = process.env.NEXT_PUBLIC_DISPLAY_TIMEZONE ?? 'Asia/Kolkata';

function zonedParts(date: Date): Record<string, string> {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: DISPLAY_TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';

  // Calendar dates carry no time or zone — format the string directly rather
  // than routing them through a Date and risking an off-by-one-day shift.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-');
    const name = MONTHS[Number(month) - 1];
    return name ? `${day} ${name} ${year}` : value;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const parts = zonedParts(date);
  const name = MONTHS[Number(parts.month) - 1];
  return name ? `${parts.day} ${name} ${parts.year}` : value;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const parts = zonedParts(date);
  const name = MONTHS[Number(parts.month) - 1];
  if (!name) return value;

  return `${parts.day} ${name} ${parts.year}, ${parts.hour}:${parts.minute}`;
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return '—';
  // Times arrive as HH:MM from the API's to_char formatting.
  if (/^\d{2}:\d{2}/.test(value)) return value.slice(0, 5);

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const parts = zonedParts(date);
  return `${parts.hour}:${parts.minute}`;
}

/** Turns SEAT_ALREADY_ALLOCATED / PARTIALLY_PAID into readable label text. */
export function humanise(value: string | null | undefined): string {
  if (!value) return '—';
  return value
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function todayIso(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

export function addDaysIso(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00`);
  date.setDate(date.getDate() + days);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
