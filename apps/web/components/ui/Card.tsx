import type { ReactNode } from 'react';
import clsx from 'clsx';
import { formatNumber } from '@/lib/format';
import { Icon, type IconName } from './Icon';

export function Card({
  title,
  description,
  action,
  children,
  className,
  padded = true,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section className={clsx('card overflow-hidden', className)}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3 sm:gap-4 sm:px-5 sm:py-3.5">
          <div>
            {title && <h2 className="text-sm font-semibold text-content">{title}</h2>}
            {description && (
              <p className="mt-0.5 text-xs text-content-muted">{description}</p>
            )}
          </div>
          {action}
        </header>
      )}
      <div className={clsx(padded && 'p-4 sm:p-5')}>{children}</div>
    </section>
  );
}

export type Accent = 'blue' | 'green' | 'amber' | 'purple' | 'rose' | 'teal';

/** Legacy `tone` values map onto an accent so existing call sites keep working. */
const TONE_ACCENT: Record<string, Accent> = {
  neutral: 'blue',
  brand: 'purple',
  positive: 'green',
  warning: 'amber',
  danger: 'rose',
};

/**
 * Dashboard metric tile.
 *
 * Each tile carries a colour identity rather than being uniformly white, so a
 * dashboard can be scanned by hue — money in is green, overdue is rose —
 * before any number is read. `value` arrives pre-formatted, because only the
 * caller knows whether it is currency or a count.
 */
export function StatCard({
  label,
  value,
  hint,
  tone = 'neutral',
  accent,
  icon,
  badge,
  delta,
  compact = false,
  progress,
  href,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'neutral' | 'positive' | 'warning' | 'danger' | 'brand';
  accent?: Accent;
  icon?: IconName;
  /** Small pill in the corner — "All clear", "+3 this week". */
  badge?: { label: string; tone?: 'accent' | 'positive' | 'danger' | 'muted' };
  /** Trend shown beside the value, e.g. "12%" rising. */
  delta?: { value: string; direction: 'up' | 'down'; good?: boolean };
  /** Denser tile so four fit across a phone. */
  compact?: boolean;
  /** 0–100. Draws a bar beneath the value, for ratios like seat occupancy. */
  progress?: number;
  href?: string;
}) {
  const resolved: Accent = accent ?? TONE_ACCENT[tone] ?? 'blue';

  const badgeClass = {
    accent: 'bg-accent-chip text-accent',
    positive: 'bg-positive-subtle text-positive',
    danger: 'bg-danger-subtle text-danger',
    muted: 'bg-surface-sunken text-content-muted',
  }[badge?.tone ?? 'accent'];

  // A rising number is usually good, but not for overdue fees — callers say so.
  const deltaGood = delta ? (delta.good ?? delta.direction === 'up') : true;

  const content = (
    <>
      <div className="flex items-start justify-between gap-2">
        {icon ? (
          <span
            className={clsx(
              'flex shrink-0 items-center justify-center rounded-xl bg-accent-chip text-accent',
              compact ? 'h-8 w-8' : 'h-10 w-10',
            )}
          >
            <Icon name={icon} className={compact ? 'h-4 w-4' : 'h-5 w-5'} />
          </span>
        ) : (
          <span />
        )}
        {badge && (
          <span
            className={clsx(
              'rounded-full px-2 py-0.5 text-[11px] font-medium leading-tight',
              badgeClass,
            )}
          >
            {badge.label}
          </span>
        )}
      </div>

      <p
        className={clsx(
          'font-semibold uppercase tracking-wider text-content-muted',
          compact ? 'mt-2 text-[10px] leading-tight' : 'mt-3 text-[11px]',
        )}
      >
        {label}
      </p>

      <div className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5">
        <span
          className={clsx(
            'font-bold tabular-nums text-content',
            compact ? 'text-lg sm:text-xl' : 'text-2xl sm:text-[28px] sm:leading-9',
          )}
        >
          {typeof value === 'number' ? formatNumber(value) : value}
        </span>
        {delta && (
          <span
            className={clsx(
              'text-[11px] font-semibold tabular-nums',
              deltaGood ? 'text-positive' : 'text-danger',
            )}
          >
            <span aria-hidden>{delta.direction === 'up' ? '↑' : '↓'}</span> {delta.value}
          </span>
        )}
      </div>

      {typeof progress === 'number' && (
        <div
          className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-accent-chip"
          role="presentation"
        >
          <div
            className="h-full rounded-full bg-accent transition-[width]"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      )}

      {hint && (
        <p className={clsx('text-content-muted', compact ? 'mt-1 text-[11px]' : 'mt-1.5 text-xs')}>
          {hint}
        </p>
      )}
    </>
  );

  const shell = clsx(
    `accent-${resolved}`,
    'rounded-card border border-border/70 bg-accent-soft',
    compact ? 'p-2.5 sm:p-4' : 'p-4 sm:p-5',
  );

  if (href) {
    return (
      <a href={href} className={clsx(shell, 'block transition-shadow hover:shadow-card')}>
        {content}
      </a>
    );
  }

  return <div className={shell}>{content}</div>;
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3 sm:mb-6 sm:gap-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-content sm:text-xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-content-muted">{description}</p>}
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  );
}
