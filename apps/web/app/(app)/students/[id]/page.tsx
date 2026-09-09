import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { StudentProfile } from '@manas/shared';
import { apiFetch, ApiRequestError } from '@/lib/api';
import { Card, PageHeader, StatCard } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDate, formatDateTime, formatMoney, formatTime } from '@/lib/format';

export const metadata: Metadata = { title: 'Student profile' };

export default async function StudentProfilePage({ params }: { params: { id: string } }) {
  let profile: StudentProfile;

  try {
    const result = await apiFetch<StudentProfile>(`/students/${params.id}/profile`);
    profile = result.data;
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) notFound();

    // A 403 here means the student belongs to another branch. Say so plainly
    // rather than pretending the record does not exist.
    return (
      <Card>
        <EmptyState
          tone="danger"
          title="Cannot show this student"
          description={
            error instanceof ApiRequestError
              ? error.message
              : 'The server did not respond.'
          }
          action={
            <Link href="/students">
              <Button variant="secondary" size="sm">
                Back to students
              </Button>
            </Link>
          }
        />
      </Card>
    );
  }

  const { student, branch, currentAdmission, membershipPlan, currentSeat, currentBatch, feeSummary } =
    profile;

  return (
    <>
      <PageHeader
        title={student.full_name}
        description={`${student.student_code} · ${branch.name}`}
        action={
          <>
            <StatusBadge status={student.status} />
            <Link href={`/students/${student.id}/edit`}>
              <Button variant="secondary">Edit</Button>
            </Link>
            <Link href={`/admissions/new?studentId=${student.id}&branchId=${student.branch_id}`}>
              <Button>New admission</Button>
            </Link>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Outstanding"
          icon="clock"
          value={formatMoney(feeSummary.outstanding)}
          tone={Number(feeSummary.outstanding) > 0 ? 'warning' : 'positive'}
          hint={
            feeSummary.nextDueDate
              ? `Next due ${formatDate(feeSummary.nextDueDate)}`
              : 'Nothing due'
          }
        />
        <StatCard label="Total paid" value={formatMoney(feeSummary.totalPaid)} tone="positive" icon="rupee" />
        <StatCard
          label="Overdue invoices"
          icon="alert"
          value={feeSummary.overdueCount}
          tone={feeSummary.overdueCount > 0 ? 'danger' : 'neutral'}
        />
        <StatCard
          label="Membership ends"
          accent="purple"
          icon="renew"
          value={currentAdmission ? formatDate(currentAdmission.end_date) : '—'}
          hint={membershipPlan?.name ?? 'No active membership'}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card title="Personal information">
          <dl className="space-y-3 text-sm">
            <Detail label="Mobile" value={student.mobile} />
            <Detail label="Email" value={student.email ?? '—'} />
            <Detail label="Date of birth" value={formatDate(student.date_of_birth)} />
            <Detail label="Address" value={student.address ?? '—'} />
            <Detail
              label="Emergency contact"
              value={
                student.emergency_contact_name
                  ? `${student.emergency_contact_name} · ${student.emergency_contact_phone ?? '—'}`
                  : '—'
              }
            />
          </dl>
        </Card>

        <Card title="Current allocation">
          <dl className="space-y-3 text-sm">
            <Detail
              label="Seat"
              value={
                currentSeat
                  ? `${currentSeat.seat_number}${currentSeat.floor ? ` · ${currentSeat.floor}` : ''}`
                  : 'No seat allocated'
              }
            />
            <Detail
              label="Batch"
              value={
                currentBatch
                  ? `${currentBatch.name} (${formatTime(currentBatch.start_time)}–${formatTime(currentBatch.end_time)})`
                  : 'Not enrolled in a batch'
              }
            />
            <Detail label="Branch" value={`${branch.name} · ${branch.branch_code}`} />
          </dl>
        </Card>

        <Card title="Membership">
          {currentAdmission ? (
            <dl className="space-y-3 text-sm">
              <Detail label="Admission number" value={currentAdmission.admission_number} />
              <Detail label="Plan" value={membershipPlan?.name ?? '—'} />
              <Detail
                label="Period"
                value={`${formatDate(currentAdmission.start_date)} – ${formatDate(currentAdmission.end_date)}`}
              />
              <div className="flex items-center justify-between gap-3">
                <dt className="text-content-muted">Status</dt>
                <dd>
                  <StatusBadge status={currentAdmission.status} />
                </dd>
              </div>
            </dl>
          ) : (
            <EmptyState
              title="No active membership"
              description="Process an admission to assign a plan, seat and batch."
              action={
                <Link
                  href={`/admissions/new?studentId=${student.id}&branchId=${student.branch_id}`}
                >
                  <Button size="sm">Start admission</Button>
                </Link>
              }
            />
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Card title="Invoices" padded={false}>
          <DataTable
            rows={profile.recentInvoices}
            rowKey={(row) => row.id}
            emptyTitle="No invoices"
            emptyDescription="Invoices appear once an admission is processed."
            columns={[
              {
                key: 'number',
                header: 'Invoice',
                render: (row) => (
                  <Link
                    href={`/invoices/${row.id}`}
                    className="font-medium text-brand hover:underline"
                  >
                    {row.invoice_number}
                  </Link>
                ),
              },
              {
                key: 'due',
                header: 'Due',
                secondary: true,
                render: (row) => (
                  <span className="tabular-nums text-content-muted">
                    {formatDate(row.due_date)}
                  </span>
                ),
              },
              {
                key: 'total',
                header: 'Total',
                align: 'right',
                render: (row) => <span className="tabular-nums">{formatMoney(row.total)}</span>,
              },
              {
                key: 'balance',
                header: 'Balance',
                align: 'right',
                render: (row) => (
                  <span
                    className={
                      Number(row.balance) > 0 ? 'tabular-nums text-warning' : 'tabular-nums'
                    }
                  >
                    {formatMoney(row.balance)}
                  </span>
                ),
              },
              {
                key: 'status',
                header: 'Status',
                align: 'right',
                render: (row) => <StatusBadge status={row.status} />,
              },
            ]}
          />
        </Card>

        <Card title="Payments" padded={false}>
          <DataTable
            rows={profile.recentPayments}
            rowKey={(row) => row.id}
            emptyTitle="No payments recorded"
            emptyDescription="Payments show up here as they are collected."
            columns={[
              {
                key: 'date',
                header: 'Date',
                render: (row) => (
                  <span className="tabular-nums">{formatDate(row.payment_date)}</span>
                ),
              },
              {
                key: 'method',
                header: 'Method',
                secondary: true,
                render: (row) => <StatusBadge status={row.payment_method} tone="neutral" />,
              },
              {
                key: 'amount',
                header: 'Amount',
                align: 'right',
                render: (row) => (
                  <span
                    className={
                      Number(row.amount) < 0
                        ? 'tabular-nums text-danger'
                        : 'tabular-nums text-positive'
                    }
                  >
                    {formatMoney(row.amount)}
                  </span>
                ),
              },
            ]}
          />
        </Card>
      </div>

      <Card title="Recent attendance" className="mt-6" padded={false}>
        <DataTable
          rows={profile.recentAttendance}
          rowKey={(row) => row.id}
          emptyTitle="No attendance recorded"
          emptyDescription="Manual or biometric attendance will appear here."
          columns={[
            {
              key: 'date',
              header: 'Date',
              render: (row) => (
                <span className="tabular-nums">{formatDate(row.attendance_date)}</span>
              ),
            },
            {
              key: 'in',
              header: 'Check in',
              secondary: true,
              render: (row) => (
                <span className="tabular-nums text-content-muted">
                  {row.check_in_time ? formatDateTime(row.check_in_time) : '—'}
                </span>
              ),
            },
            {
              key: 'out',
              header: 'Check out',
              secondary: true,
              render: (row) => (
                <span className="tabular-nums text-content-muted">
                  {row.check_out_time ? formatDateTime(row.check_out_time) : '—'}
                </span>
              ),
            },
            {
              key: 'source',
              header: 'Source',
              secondary: true,
              render: (row) => <StatusBadge status={row.source} tone="neutral" />,
            },
            {
              key: 'status',
              header: 'Status',
              align: 'right',
              render: (row) => <StatusBadge status={row.status} />,
            },
          ]}
        />
      </Card>
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-content-muted">{label}</dt>
      <dd className="text-right text-content">{value}</dd>
    </div>
  );
}
