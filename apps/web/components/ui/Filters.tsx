'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import { Button } from './Button';

/**
 * Filters live in the URL, not component state: a filtered list stays
 * shareable, survives a refresh, and lets the server component do the fetch.
 */
export function useQueryFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setParam = useCallback(
    (updates: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());

      for (const [key, value] of Object.entries(updates)) {
        if (!value) params.delete(key);
        else params.set(key, value);
      }

      // Any filter change invalidates the current page number.
      if (!('page' in updates)) params.delete('page');

      router.push(`${pathname}?${params.toString()}`);
    },
    [pathname, router, searchParams],
  );

  return { searchParams, setParam };
}

export function SearchInput({
  placeholder = 'Search…',
  paramName = 'search',
}: {
  placeholder?: string;
  paramName?: string;
}) {
  const { searchParams, setParam } = useQueryFilters();
  const [value, setValue] = useState(searchParams.get(paramName) ?? '');

  useEffect(() => {
    setValue(searchParams.get(paramName) ?? '');
  }, [searchParams, paramName]);

  useEffect(() => {
    const current = searchParams.get(paramName) ?? '';
    if (value === current) return;

    // Debounced so typing does not fire a request per keystroke.
    const timer = window.setTimeout(() => {
      setParam({ [paramName]: value || undefined });
    }, 350);

    return () => window.clearTimeout(timer);
  }, [value, paramName, searchParams, setParam]);

  return (
    <div className="relative w-full sm:w-72">
      <span
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-content-subtle"
      >
        ⌕
      </span>
      <input
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="input-base pl-8"
      />
    </div>
  );
}

export function FilterSelect({
  paramName,
  label,
  options,
  allLabel = 'All',
}: {
  paramName: string;
  label: string;
  options: Array<{ value: string; label: string }>;
  allLabel?: string;
}) {
  const { searchParams, setParam } = useQueryFilters();
  const value = searchParams.get(paramName) ?? '';

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="whitespace-nowrap text-content-muted">{label}</span>
      <select
        value={value}
        onChange={(event) => setParam({ [paramName]: event.target.value || undefined })}
        className="input-base h-9 w-auto min-w-[9rem] py-1"
      >
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function DateFilter({ paramName, label }: { paramName: string; label: string }) {
  const { searchParams, setParam } = useQueryFilters();

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="whitespace-nowrap text-content-muted">{label}</span>
      <input
        type="date"
        value={searchParams.get(paramName) ?? ''}
        onChange={(event) => setParam({ [paramName]: event.target.value || undefined })}
        className="input-base h-9 w-auto py-1"
      />
    </label>
  );
}

export function FilterBar({ children }: { children: ReactNode }) {
  const { searchParams, setParam } = useQueryFilters();
  const hasFilters = Array.from(searchParams.keys()).some((key) => key !== 'page');

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      {children}
      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            setParam(
              Object.fromEntries(
                Array.from(searchParams.keys()).map((key) => [key, undefined]),
              ),
            )
          }
        >
          Clear filters
        </Button>
      )}
    </div>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  totalPages,
}: {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}) {
  const { setParam } = useQueryFilters();

  if (total === 0) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3 text-sm"
    >
      <p className="text-content-muted">
        Showing <span className="font-medium text-content">{from}</span>–
        <span className="font-medium text-content">{to}</span> of{' '}
        <span className="font-medium text-content">{total}</span>
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={page <= 1}
          onClick={() => setParam({ page: String(page - 1) })}
        >
          Previous
        </Button>
        <span className={clsx('px-1 text-content-muted')}>
          Page {page} of {Math.max(totalPages, 1)}
        </span>
        <Button
          variant="secondary"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => setParam({ page: String(page + 1) })}
        >
          Next
        </Button>
      </div>
    </nav>
  );
}
