import clsx from 'clsx';
import { humanise } from '@/lib/format';

type Tone = 'neutral' | 'positive' | 'warning' | 'danger' | 'info' | 'brand';

const TONE_CLASSES: Record<Tone, string> = {
  neutral: 'bg-surface-sunken text-content-muted ring-border',
  positive: 'bg-positive-subtle text-positive ring-positive/25',
  warning: 'bg-warning-subtle text-warning ring-warning/25',
  danger: 'bg-danger-subtle text-danger ring-danger/25',
  info: 'bg-info-subtle text-info ring-info/25',
  brand: 'bg-brand-subtle text-brand ring-brand/25',
};

/**
 * Status → tone map covering every enum the API can return. Colour alone is
 * never the signal — the label is always spelled out (PRD §37).
 */
const STATUS_TONES: Record<string, Tone> = {
  ACTIVE: 'positive',
  CONFIRMED: 'positive',
  PAID: 'positive',
  PRESENT: 'positive',
  AVAILABLE: 'positive',
  COMPLETED: 'positive',
  SENT: 'positive',

  PENDING: 'info',
  UPCOMING: 'info',
  DRAFT: 'neutral',
  RESERVED: 'info',
  OCCUPIED: 'brand',
  TRANSFERRED: 'info',

  PARTIALLY_PAID: 'warning',
  DUE: 'warning',
  LATE: 'warning',
  MAINTENANCE: 'warning',
  SUSPENDED: 'warning',
  DUE_TODAY: 'warning',

  OVERDUE: 'danger',
  EXPIRED: 'danger',
  CANCELLED: 'danger',
  ABSENT: 'danger',
  FAILED: 'danger',
  ERROR: 'danger',
  REVERSED: 'danger',

  INACTIVE: 'neutral',
  RELEASED: 'neutral',
  SKIPPED: 'neutral',
};

export function StatusBadge({
  status,
  tone,
  className,
}: {
  status: string | null | undefined;
  tone?: Tone;
  className?: string;
}) {
  if (!status) return <span className="text-content-subtle">—</span>;

  const resolvedTone = tone ?? STATUS_TONES[status] ?? 'neutral';

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        TONE_CLASSES[resolvedTone],
        className,
      )}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {humanise(status)}
    </span>
  );
}
