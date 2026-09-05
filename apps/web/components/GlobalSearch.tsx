'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SearchResult } from '@manas/shared';
import { api } from '@/lib/api-client';
import { humanise } from '@/lib/format';

/**
 * Cross-entity search (PRD §29). Results come from the API, so they are
 * already limited to the branches this user may see.
 */
export function GlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const timer = window.setTimeout(async () => {
      try {
        const response = await api.get<SearchResult[]>('/search', { q: query.trim() });
        if (!cancelled) {
          setResults(response.data);
          setOpen(true);
        }
      } catch {
        // A failed search should never interrupt what the user is doing.
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder="Search students, invoices, seats…"
        aria-label="Search students, invoices, seats and admissions"
        role="combobox"
        aria-expanded={open}
        aria-controls="global-search-results"
        className="input-base h-9 w-44 py-1 text-sm focus:w-64 sm:w-56 sm:focus:w-80"
      />

      {open && query.trim().length >= 2 && (
        <div
          id="global-search-results"
          role="listbox"
          className="absolute right-0 top-11 z-50 w-[22rem] overflow-hidden rounded-card border border-border bg-surface-raised shadow-overlay"
        >
          {loading && results.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-content-muted">Searching…</p>
          ) : results.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-content-muted">
              No matches for “{query}”.
            </p>
          ) : (
            <ul className="max-h-80 overflow-y-auto scrollbar-thin">
              {results.map((result) => (
                <li key={`${result.type}-${result.id}`}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => {
                      setOpen(false);
                      setQuery('');
                      router.push(result.href);
                    }}
                    className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-surface-sunken"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-content">{result.label}</span>
                      <span className="block truncate text-xs text-content-subtle">
                        {result.sublabel}
                      </span>
                    </span>
                    <span className="shrink-0 rounded bg-surface-sunken px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-content-subtle">
                      {humanise(result.type)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
