import type { Metadata } from 'next';
import type { BiometricDevice, MembershipPlan } from '@manas/shared';
import { apiFetchSafe } from '@/lib/api';
import { Card, PageHeader } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatDateTime, formatMoney } from '@/lib/format';
import { PlanFormDialog } from './PlanFormDialog';
import { DeviceFormDialog, DeviceRowActions } from './DeviceSettings';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const [plans, devices] = await Promise.all([
    apiFetchSafe<MembershipPlan[]>('/memberships', {}, []),
    apiFetchSafe<BiometricDevice[]>(
      '/biometric/devices',
      { query: { branchId: searchParams.branchId } },
      [],
    ),
  ]);

  return (
    <>
      <PageHeader
        title="Settings"
        description="Membership pricing and biometric devices."
      />

      <Card
        title="Membership plans"
        description="Franchise-wide pricing. Existing invoices keep the price they were sold at."
        action={<PlanFormDialog />}
        padded={false}
      >
        <DataTable
          rows={plans.data}
          rowKey={(row) => row.id}
          error={plans.error}
          caption="Membership plans"
          emptyTitle="No membership plans"
          emptyDescription="Create at least one plan before processing admissions."
          columns={[
            {
              key: 'name',
              header: 'Plan',
              render: (row) => (
                <div>
                  <p className="font-medium text-content">{row.name}</p>
                  {row.description && (
                    <p className="text-xs text-content-subtle">{row.description}</p>
                  )}
                </div>
              ),
            },
            {
              key: 'duration',
              header: 'Duration',
              align: 'right',
              render: (row) => (
                <span className="tabular-nums">{row.duration_days} days</span>
              ),
            },
            {
              key: 'price',
              header: 'Price',
              align: 'right',
              render: (row) => (
                <span className="tabular-nums font-medium">{formatMoney(row.price)}</span>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              align: 'right',
              render: (row) => <StatusBadge status={row.status} />,
            },
            {
              key: 'actions',
              header: '',
              align: 'right',
              render: (row) => <PlanFormDialog plan={row} />,
            },
          ]}
        />
      </Card>

      <Card
        title="Biometric devices"
        description="Attendance machines registered against a branch. The integration is provider-agnostic — configure BIOMETRIC_PROVIDER once the device API is known."
        action={<DeviceFormDialog branchId={searchParams.branchId} />}
        className="mt-6"
        padded={false}
      >
        <DataTable
          rows={devices.data}
          rowKey={(row) => row.id}
          error={devices.error}
          caption="Biometric devices"
          emptyTitle="No devices registered"
          emptyDescription="Register a device to start syncing attendance automatically."
          columns={[
            {
              key: 'name',
              header: 'Device',
              render: (row) => (
                <div>
                  <p className="font-medium text-content">{row.name}</p>
                  <p className="text-xs text-content-subtle">{row.device_identifier}</p>
                </div>
              ),
            },
            {
              key: 'address',
              header: 'Address',
              secondary: true,
              render: (row) => (
                <span className="text-content-muted">
                  {row.api_endpoint ?? row.ip_address ?? '—'}
                </span>
              ),
            },
            {
              key: 'sync',
              header: 'Last sync',
              secondary: true,
              render: (row) => (
                <span className="tabular-nums text-content-muted">
                  {row.last_sync_at ? formatDateTime(row.last_sync_at) : 'Never'}
                </span>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              align: 'right',
              render: (row) => <StatusBadge status={row.status} />,
            },
            {
              key: 'actions',
              header: '',
              align: 'right',
              render: (row) => <DeviceRowActions device={row} />,
            },
          ]}
        />
      </Card>
    </>
  );
}
