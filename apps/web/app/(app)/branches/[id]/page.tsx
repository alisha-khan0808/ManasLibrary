import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { Branch } from '@manas/shared';
import { apiFetch, apiFetchSafe, ApiRequestError } from '@/lib/api';
import { Card, PageHeader, StatCard } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatTime } from '@/lib/format';
import { BranchFormDialog } from '../BranchFormDialog';

export const metadata: Metadata = { title: 'Branch' };

interface BranchStats {
  total_seats: number;
  occupied_seats: number;
  available_seats: number;
  active_students: number;
  active_batches: number;
  staff_count: number;
}

export default async function BranchDetailPage({ params }: { params: { id: string } }) {
  let branch: Branch;

  try {
    const result = await apiFetch<Branch>(`/branches/${params.id}`);
    branch = result.data;
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) notFound();
    throw error;
  }

  const stats = await apiFetchSafe<BranchStats | null>(
    `/branches/${params.id}/stats`,
    {},
    null,
  );

  return (
    <>
      <PageHeader
        title={branch.name}
        description={`${branch.branch_code}${branch.city ? ` · ${branch.city}` : ''}`}
        action={
          <>
            <StatusBadge status={branch.status} />
            <BranchFormDialog branch={branch} />
          </>
        }
      />

      {stats.data && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Active students" value={stats.data.active_students} />
          <StatCard
            label="Seats"
            value={stats.data.total_seats}
            hint={`${stats.data.occupied_seats} occupied · ${stats.data.available_seats} free`}
            tone="brand"
          />
          <StatCard label="Active batches" value={stats.data.active_batches} />
          <StatCard label="Assigned staff" value={stats.data.staff_count} />
        </div>
      )}

      <Card title="Branch details" className="mt-6">
        <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          <Row label="Branch code" value={branch.branch_code} />
          <Row label="Status" value={branch.status} />
          <Row label="Phone" value={branch.phone ?? '—'} />
          <Row label="Email" value={branch.email ?? '—'} />
          <Row label="City" value={branch.city ?? '—'} />
          <Row label="State" value={branch.state ?? '—'} />
          <Row
            label="Hours"
            value={
              branch.opening_time
                ? `${formatTime(branch.opening_time)} – ${formatTime(branch.closing_time)}`
                : '—'
            }
          />
          <Row label="Address" value={branch.address ?? '—'} />
        </dl>
      </Card>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border pb-2 last:border-0">
      <dt className="text-content-muted">{label}</dt>
      <dd className="text-right text-content">{value}</dd>
    </div>
  );
}
