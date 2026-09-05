import type { ReactNode } from 'react';
import clsx from 'clsx';

export function EmptyState({
  title,
  description,
  action,
  tone = 'neutral',
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  tone?: 'neutral' | 'danger';
  icon?: ReactNode;
}) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : undefined}
      className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center"
    >
      <div
        aria-hidden
        className={clsx(
          'flex h-11 w-11 items-center justify-center rounded-full',
          tone === 'danger' ? 'bg-danger-subtle text-danger' : 'bg-surface-sunken text-content-subtle',
        )}
      >
        {icon ?? (tone === 'danger' ? '!' : '·')}
      </div>
      <div className="space-y-1">
        <p className={clsx('text-sm font-medium', tone === 'danger' ? 'text-danger' : 'text-content')}>
          {title}
        </p>
        {description && (
          <p className="mx-auto max-w-sm text-sm text-content-muted">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

/** Skeleton rows for a table that is still loading. */
export function TableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="animate-pulse p-4" aria-hidden>
      <div className="mb-3 h-8 rounded bg-surface-sunken" />
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="mb-2 flex gap-3">
          {Array.from({ length: columns }).map((_, columnIndex) => (
            <div
              key={columnIndex}
              className="h-9 flex-1 rounded bg-surface-sunken"
              style={{ opacity: 1 - rowIndex * 0.1 }}
            />
          ))}
        </div>
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export function CardSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-hidden>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="card h-28 animate-pulse bg-surface-sunken" />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}
