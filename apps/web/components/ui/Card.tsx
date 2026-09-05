import type { ReactNode } from 'react';
import clsx from 'clsx';
import { formatNumber } from '@/lib/format';

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
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-3.5">
          <div>
            {title && <h2 className="text-sm font-semibold text-content">{title}</h2>}
            {description && (
              <p className="mt-0.5 text-xs text-content-muted">{description}</p>
            )}
          </div>
          {action}
        </header>
      )}
      <div className={clsx(padded && 'p-5')}>{children}</div>
    </section>
  );
}

/**
 * Dashboard metric tile. `value` is pre-formatted by the caller so money and
 * counts each use the right formatter.
 */
export function StatCard({
  label,
  value,
  hint,
  tone = 'neutral',
  href,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'neutral' | 'positive' | 'warning' | 'danger' | 'brand';
  href?: string;
}) {
  const toneClass = {
    neutral: 'text-content',
    positive: 'text-positive',
    warning: 'text-warning',
    danger: 'text-danger',
    brand: 'text-brand',
  }[tone];

  const content = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-content-subtle">{label}</p>
      <p className={clsx('mt-2 text-2xl font-semibold tabular-nums', toneClass)}>
        {typeof value === 'number' ? formatNumber(value) : value}
      </p>
      {hint && <p className="mt-1 text-xs text-content-muted">{hint}</p>}
    </>
  );

  if (href) {
    return (
      <a
        href={href}
        className="card block p-5 transition-colors hover:border-brand/40 hover:bg-surface-sunken/40"
      >
        {content}
      </a>
    );
  }

  return <div className="card p-5">{content}</div>;
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
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-content">{title}</h1>
        {description && <p className="mt-1 text-sm text-content-muted">{description}</p>}
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  );
}
