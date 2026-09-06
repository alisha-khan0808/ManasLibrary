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

  // The first column is the row's identity (name, invoice number, seat) in
  // every list, so it becomes the card heading and the rest become labelled
  // rows. Doing this here means no page has to define a second layout.
  const [leadColumn, ...restColumns] = columns;

  return (
    <>
      <ul className="divide-y divide-border md:hidden">
        {rows.map((row) => (
          <li key={rowKey(row)} className="px-4 py-3.5">
            {leadColumn && (
              <div className="text-sm font-medium text-content">
                {leadColumn.render(row)}
              </div>
            )}
            {restColumns.length > 0 && (
              <dl className="mt-2 grid grid-cols-[minmax(0,7rem)_1fr] gap-x-3 gap-y-1.5">
                {restColumns.map((column) => (
                  <div key={column.key} className="contents">
                    <dt className="text-[11px] uppercase tracking-wide text-content-subtle">
                      {column.header}
                    </dt>
                    <dd className="min-w-0 text-sm text-content">{column.render(row)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto scrollbar-thin md:block">
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
    </>
  );
}
