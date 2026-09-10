import Link from 'next/link';
import clsx from 'clsx';
import type { Accent } from './Card';
import { Icon, type IconName } from './Icon';

export interface OverviewItem {
  label: string;
  count: number;
  href: string;
  icon: IconName;
  accent: Accent;
  /** Rendered as an alarming count rather than a neutral one. */
  urgent?: boolean;
}

/**
 * "Today's overview" — the short list of things that may need attention.
 *
 * Deliberately counts rather than amounts: these are queues to work through,
 * and a number you can act on beats a figure you can only read. Each row links
 * to the filtered list that produced the count, so tapping one lands on the
 * work itself.
 */
export function OverviewList({
  title = "Today's overview",
  items,
  viewAllHref,
}: {
  title?: string;
  items: OverviewItem[];
  viewAllHref?: string;
}) {
  return (
    <section className="card overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-content">{title}</h2>
        {viewAllHref && (
          <Link href={viewAllHref} className="text-xs font-medium text-brand hover:underline">
            View all
          </Link>
        )}
      </header>

      <ul className="divide-y divide-border">
        {items.map((item) => (
          <li key={item.label}>
            <Link
              href={item.href}
              className={clsx(
                `accent-${item.accent}`,
                'flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-sunken',
              )}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-chip text-accent">
                <Icon name={item.icon} className="h-[18px] w-[18px]" />
              </span>

              <span className="min-w-0 flex-1 truncate text-sm text-content">{item.label}</span>

              <span
                className={clsx(
                  'rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums',
                  item.urgent && item.count > 0
                    ? 'bg-danger-subtle text-danger'
                    : 'bg-accent-chip text-accent',
                )}
              >
                {item.count}
              </span>

              <span aria-hidden className="text-content-subtle">
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
