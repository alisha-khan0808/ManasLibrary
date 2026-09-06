import type { Metadata } from 'next';
import Link from 'next/link';
import type { SuperAdminDashboard } from '@manas/shared';
import { apiFetchSafe } from '@/lib/api';
import { Card, PageHeader, StatCard } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import { TrendChart } from './TrendChart';

export const metadata: Metadata = { title: 'Dashboard' };

interface TrendPoint {
  day: string;
  collection: string;
  attendance: number;
  admissions: number;
}

interface Renewal {
  id: string;
  admission_number: string;
  end_date: string;
  student_id: string;
  full_name: string;
  mobile: string;
  student_code: string;
  plan_name: string;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { branchId?: string };
}) {
  const branchId = searchParams.branchId;

  const [dashboard, trends, renewals] = await Promise.all([
    apiFetchSafe<SuperAdminDashboard | null>('/dashboard', { query: { branchId } }, null),
    apiFetchSafe<TrendPoint[]>('/dashboard/trends', { query: { branchId, days: 14 } }, []),
    apiFetchSafe<Renewal[]>('/admissions/renewals', { query: { branchId, days: 15 } }, []),
  ]);

  const metrics = dashboard.data;

  if (dashboard.error || !metrics) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <Card>
          <EmptyState
            tone="danger"
            title="Could not load dashboard metrics"
            description={dashboard.error ?? 'No data was returned.'}
          />
        </Card>
      </>
    );
  }

  const occupancy =
    metrics.totalSeats > 0
      ? Math.round((metrics.occupiedSeats / metrics.totalSeats) * 100)
      : 0;

  const isConsolidated = 'totalBranches' in metrics && metrics.branchBreakdown !== undefined;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={
          branchId
            ? 'Operational snapshot for the selected branch.'
            : isConsolidated
              ? 'Consolidated view across every branch you can see.'
              : 'Operational snapshot across your branches.'
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label="Active students"
          value={metrics.activeStudents}
          href="/students?status=ACTIVE"
        />
        <StatCard
          label="Seat occupancy"
          value={`${occupancy}%`}
          hint={`${formatNumber(metrics.occupiedSeats)} of ${formatNumber(metrics.totalSeats)} occupied · ${formatNumber(metrics.availableSeats)} free`}
          tone="brand"
          href="/seats"
        />
        <StatCard
          label="Today's attendance"
          value={metrics.todayAttendance}
          hint={`${formatNumber(metrics.todayAdmissions)} admission(s) today`}
          href="/attendance"
        />
        <StatCard
          label="Today's collection"
          value={formatMoney(metrics.todayCollection)}
          tone="positive"
          href="/payments"
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:mt-4 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label="Pending fees"
          value={formatMoney(metrics.pendingFees)}
          tone="warning"
          href="/fees?status=UPCOMING"
        />
        <StatCard
          label="Overdue fees"
          value={formatMoney(metrics.overdueFees)}
          tone="danger"
          href="/fees?status=OVERDUE"
        />
        <StatCard
          label="Renewals due (15 days)"
          value={metrics.upcomingRenewals}
          hint="Memberships ending soon"
        />
        {isConsolidated ? (
          <StatCard
            label="Branches"
            value={`${formatNumber(metrics.activeBranches)} / ${formatNumber(metrics.totalBranches)}`}
            hint="Active of total"
            href="/branches"
          />
        ) : (
          <StatCard label="Available seats" value={metrics.availableSeats} tone="positive" />
        )}
      </div>

      <div className="mt-5 grid gap-4 sm:mt-6 xl:grid-cols-3">
        <Card
          title="Last 14 days"
          description="Daily collection, attendance and new admissions"
          className="xl:col-span-2"
        >
          {trends.data.length === 0 ? (
            <EmptyState
              title="No activity yet"
              description="Charts appear once payments and attendance start coming in."
            />
          ) : (
            <TrendChart data={trends.data} />
          )}
        </Card>

        <Card
          title="Upcoming renewals"
          description="Memberships ending in the next 15 days"
          padded={false}
        >
          <DataTable
            rows={renewals.data.slice(0, 8)}
            rowKey={(row) => row.id}
            error={renewals.error}
            emptyTitle="No renewals due"
            emptyDescription="Nothing expires in the next 15 days."
            columns={[
              {
                key: 'student',
                header: 'Student',
                render: (row) => (
                  <Link
                    href={`/students/${row.student_id}`}
                    className="font-medium text-brand hover:underline"
                  >
                    {row.full_name}
                  </Link>
                ),
              },
              {
                key: 'plan',
                header: 'Plan',
                secondary: true,
                render: (row) => (
                  <span className="text-content-muted">{row.plan_name}</span>
                ),
              },
              {
                key: 'end',
                header: 'Ends',
                align: 'right',
                render: (row) => (
                  <span className="tabular-nums">{formatDate(row.end_date)}</span>
                ),
              },
            ]}
          />
        </Card>
      </div>

      {isConsolidated && metrics.branchBreakdown.length > 0 && (
        <Card
          title="Branch performance"
          description="Today's collection and outstanding balance by branch"
          className="mt-6"
          padded={false}
        >
          <DataTable
            rows={metrics.branchBreakdown}
            rowKey={(row) => row.branchId}
            columns={[
              {
                key: 'branch',
                header: 'Branch',
                render: (row) => (
                  <Link
                    href={`/branches/${row.branchId}`}
                    className="font-medium text-brand hover:underline"
                  >
                    {row.branchName}
                  </Link>
                ),
              },
              {
                key: 'students',
                header: 'Active students',
                align: 'right',
                render: (row) => (
                  <span className="tabular-nums">{formatNumber(row.activeStudents)}</span>
                ),
              },
              {
                key: 'seats',
                header: 'Occupied seats',
                align: 'right',
                secondary: true,
                render: (row) => (
                  <span className="tabular-nums">{formatNumber(row.occupiedSeats)}</span>
                ),
              },
              {
                key: 'collection',
                header: "Today's collection",
                align: 'right',
                render: (row) => (
                  <span className="tabular-nums text-positive">
                    {formatMoney(row.todayCollection)}
                  </span>
                ),
              },
              {
                key: 'outstanding',
                header: 'Outstanding',
                align: 'right',
                render: (row) => (
                  <span className="tabular-nums">{formatMoney(row.outstanding)}</span>
                ),
              },
              {
                key: 'status',
                header: '',
                align: 'right',
                secondary: true,
                render: (row) => (
                  <StatusBadge
                    status={Number(row.outstanding) > 0 ? 'DUE' : 'PAID'}
                    tone={Number(row.outstanding) > 0 ? 'warning' : 'positive'}
                  />
                ),
              },
            ]}
          />
        </Card>
      )}
    </>
  );
}
