import type { Metadata } from 'next';
import Link from 'next/link';
import { apiFetchSafe } from '@/lib/api';
import { Card, PageHeader, StatCard } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { DateFilter, FilterBar } from '@/components/ui/Filters';
import { AttendanceRoster, type RosterRow } from './AttendanceRoster';
import { todayIso } from '@/lib/format';

export const metadata: Metadata = { title: 'Attendance' };

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const date = searchParams.date ?? todayIso();

  const roster = await apiFetchSafe<RosterRow[]>(
    '/attendance/roster',
    { query: { branchId: searchParams.branchId, batchId: searchParams.batchId, date } },
    [],
  );

  const present = roster.data.filter(
    (row) => row.attendance_status && row.attendance_status !== 'ABSENT',
  ).length;
  const biometric = roster.data.filter((row) => row.source === 'BIOMETRIC').length;

  return (
    <>
      <PageHeader
        title="Attendance"
        description="Mark today's attendance, or review and correct an earlier day."
        action={
          <Link href="/attendance/history">
            <Button variant="secondary">History</Button>
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Active students" value={roster.data.length} />
        <StatCard
          label="Present"
          value={present}
          tone="positive"
          hint={`${roster.data.length - present} not yet marked`}
        />
        <StatCard label="From biometric" value={biometric} hint="Synced from a device" />
      </div>

      <div className="mt-6">
        <FilterBar>
          <DateFilter paramName="date" label="Date" />
        </FilterBar>
      </div>

      <Card padded={false}>
        <AttendanceRoster rows={roster.data} date={date} error={roster.error} />
      </Card>
    </>
  );
}
