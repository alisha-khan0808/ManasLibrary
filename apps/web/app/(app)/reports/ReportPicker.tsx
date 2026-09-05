'use client';

import clsx from 'clsx';
import { useQueryFilters } from '@/components/ui/Filters';
import { humanise } from '@/lib/format';

export function ReportPicker({
  reports,
  current,
}: {
  reports: string[];
  current: string;
}) {
  const { setParam } = useQueryFilters();

  if (reports.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Available reports">
      {reports.map((report) => (
        <button
          key={report}
          type="button"
          role="tab"
          aria-selected={report === current}
          onClick={() => setParam({ report })}
          className={clsx(
            'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
            report === current
              ? 'bg-brand text-white'
              : 'bg-surface-sunken text-content-muted hover:bg-brand-subtle hover:text-brand',
          )}
        >
          {humanise(report.replace(/-/g, '_'))}
        </button>
      ))}
    </div>
  );
}
