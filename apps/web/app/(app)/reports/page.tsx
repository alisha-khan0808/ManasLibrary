import type { Metadata } from 'next';
import { apiFetchSafe } from '@/lib/api';
import { Card, PageHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { DateFilter, FilterBar } from '@/components/ui/Filters';
import { ReportPicker } from './ReportPicker';
import { ReportTable } from './ReportTable';
import { addDaysIso, todayIso } from '@/lib/format';

export const metadata: Metadata = { title: 'Reports' };

const DEFAULT_REPORT = 'active-students';

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const report = searchParams.report ?? DEFAULT_REPORT;
  const from = searchParams.from ?? addDaysIso(todayIso(), -29);
  const to = searchParams.to ?? todayIso();

  const [available, rows] = await Promise.all([
    apiFetchSafe<string[]>('/reports', {}, []),
    apiFetchSafe<Record<string, unknown>[]>(
      `/reports/${report}`,
      { query: { branchId: searchParams.branchId, from, to } },
      [],
    ),
  ]);

  const exportParams = new URLSearchParams({ format: 'csv', from, to });
  if (searchParams.branchId) exportParams.set('branchId', searchParams.branchId);

  return (
    <>
      <PageHeader
        title="Reports"
        description="Every report respects your branch access — nothing here widens what you can see."
      />

      <ReportPicker reports={available.data} current={report} />

      <div className="mt-4">
        <FilterBar>
          <DateFilter paramName="from" label="From" />
          <DateFilter paramName="to" label="To" />
        </FilterBar>
      </div>

      <Card padded={false}>
        {rows.error ? (
          <EmptyState tone="danger" title="Could not run this report" description={rows.error} />
        ) : (
          <ReportTable
            rows={rows.data}
            reportName={report}
            exportQuery={exportParams.toString()}
          />
        )}
      </Card>
    </>
  );
}
