import type { Metadata } from 'next';
import type { Batch } from '@manas/shared';
import { apiFetchSafe } from '@/lib/api';
import { Card, PageHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatTime } from '@/lib/format';
import { BatchFormDialog } from './BatchFormDialog';

export const metadata: Metadata = { title: 'Batches' };

export interface BatchWithLoad extends Batch {
  enrolled_count: number;
  available_slots: number;
}

export default async function BatchesPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const result = await apiFetchSafe<BatchWithLoad[]>(
    '/batches',
    { query: { branchId: searchParams.branchId } },
    [],
  );

  return (
    <>
      <PageHeader
        title="Batches"
        description="Study sessions and their capacity. A student can hold one active batch at a time."
        action={<BatchFormDialog branchId={searchParams.branchId} />}
      />

      {result.error ? (
        <Card>
          <EmptyState tone="danger" title="Could not load batches" description={result.error} />
        </Card>
      ) : result.data.length === 0 ? (
        <Card>
          <EmptyState
            title="No batches configured"
            description="Create Morning, Afternoon and Evening sessions to start enrolling students."
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {result.data.map((batch) => {
            const fillPercent =
              batch.capacity > 0
                ? Math.min(100, Math.round((batch.enrolled_count / batch.capacity) * 100))
                : 0;

            return (
              <Card key={batch.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-content">{batch.name}</h3>
                    <p className="mt-0.5 text-xs tabular-nums text-content-muted">
                      {formatTime(batch.start_time)} – {formatTime(batch.end_time)}
                    </p>
                  </div>
                  <StatusBadge status={batch.status} />
                </div>

                <div className="mt-4">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="tabular-nums font-medium text-content">
                      {batch.enrolled_count} / {batch.capacity}
                    </span>
                    <span
                      className={
                        batch.available_slots <= 0
                          ? 'text-xs text-danger'
                          : 'text-xs text-content-muted'
                      }
                    >
                      {batch.available_slots <= 0
                        ? 'Full'
                        : `${batch.available_slots} seat(s) free`}
                    </span>
                  </div>

                  {/* Width alone would be ambiguous; the numbers above carry
                      the same information for anyone who cannot see the bar. */}
                  <div
                    role="progressbar"
                    aria-valuenow={fillPercent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${batch.name} capacity`}
                    className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken"
                  >
                    <div
                      className={
                        fillPercent >= 100
                          ? 'h-full rounded-full bg-danger'
                          : fillPercent >= 80
                            ? 'h-full rounded-full bg-warning'
                            : 'h-full rounded-full bg-brand'
                      }
                      style={{ width: `${fillPercent}%` }}
                    />
                  </div>
                </div>

                <div className="mt-4 flex justify-end">
                  <BatchFormDialog batch={batch} branchId={batch.branch_id} />
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
