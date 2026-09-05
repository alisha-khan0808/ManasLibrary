import type { ReactNode } from 'react';
import clsx from 'clsx';
import { EmptyState } from './EmptyState';

export interface Column<T> {
  key: string;
  header: string;
  /** Renders the cell. Keep formatting here, not in the page component. */
  render: (row: T) => ReactNode;
  align?: 'left' | 'right' | 'center';
  className?: string;
  /** Hidden below `md`, for columns that matter less on a narrow screen. */
  secondary?: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  error?: string | null;
  caption?: string;
}

const ALIGN = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
} as const;

/**
 * The single table implementation used by every list screen. Empty, error and
 * populated states all live here so no page reinvents them (PRD §36).
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  emptyTitle = 'Nothing here yet',
  emptyDescription = 'Records will appear once they are created.',
  emptyAction,
  error,
  caption,
}: DataTableProps<T>) {
  if (error) {
    return (
      <EmptyState
        tone="danger"
        title="Could not load this list"
        description={error}
      />
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
    );
  }

  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className="w-full min-w-full border-collapse">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-b border-border bg-surface-sunken/60">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={clsx(
                  'table-cell font-medium uppercase tracking-wide text-content-subtle',
                  'text-[11px]',
                  ALIGN[column.align ?? 'left'],
                  column.secondary && 'hidden md:table-cell',
                  column.className,
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className="border-b border-border last:border-0 transition-colors hover:bg-surface-sunken/50"
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={clsx(
                    'table-cell text-content',
                    ALIGN[column.align ?? 'left'],
                    column.secondary && 'hidden md:table-cell',
                    column.className,
                  )}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
