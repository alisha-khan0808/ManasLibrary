'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Permission, type SeatAllocation, type Student } from '@manas/shared';
import type { SeatWithOccupant } from './page';
import { api, ApiClientError } from '@/lib/api-client';
import { useToast } from '@/components/ui/Toast';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useSession } from '@/components/SessionProvider';
import { InputField, SelectField } from '@/components/ui/Field';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { addDaysIso, formatDate, todayIso } from '@/lib/format';

type Mode = 'overview' | 'allocate' | 'transfer' | 'release' | 'maintenance' | 'restore';

export function SeatActionDialog({
  seat,
  onClose,
}: {
  seat: SeatWithOccupant;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();

  const { can } = useSession();
  const canManageSeats = can(Permission.SEAT_MANAGE);

  const [mode, setMode] = useState<Mode>('overview');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [students, setStudents] = useState<Student[]>([]);
  const [availableSeats, setAvailableSeats] = useState<SeatWithOccupant[]>([]);
  const [studentId, setStudentId] = useState('');
  const [targetSeatId, setTargetSeatId] = useState('');
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState(addDaysIso(todayIso(), 29));

  // Only load the pickers the chosen action actually needs.
  useEffect(() => {
    if (mode !== 'allocate') return;

    api
      .get<Student[]>('/students', {
        branchId: seat.branch_id,
        status: 'ACTIVE',
        pageSize: 100,
      })
      .then((response) => setStudents(response.data))
      .catch(() => setError('Could not load students for this branch.'));
  }, [mode, seat.branch_id]);

  useEffect(() => {
    if (mode !== 'transfer') return;

    api
      .get<SeatWithOccupant[]>('/seats', {
        branchId: seat.branch_id,
        availableOn: todayIso(),
      })
      .then((response) =>
        setAvailableSeats(response.data.filter((candidate) => candidate.id !== seat.id)),
      )
      .catch(() => setError('Could not load available seats.'));
  }, [mode, seat.branch_id, seat.id]);

  async function run(action: () => Promise<{ message: string }>) {
    setLoading(true);
    setError(null);

    try {
      const result = await action();
      toast.success(result.message);
      onClose();
      router.refresh();
    } catch (caught) {
      const message =
        caught instanceof ApiClientError
          ? caught.message
          : 'Could not reach the server. Please try again.';
      setError(message);
      setLoading(false);
    }
  }

  const allocate = () =>
    run(() =>
      api.post<SeatAllocation>('/seat-allocations', {
        branch_id: seat.branch_id,
        seat_id: seat.id,
        student_id: studentId,
        start_date: startDate,
        end_date: endDate || null,
      }),
    );

  const transfer = () =>
    run(() =>
      api.post<SeatAllocation>('/seat-allocations/transfer', {
        allocation_id: seat.allocation_id,
        new_seat_id: targetSeatId,
        effective_date: startDate,
      }),
    );

  const release = () =>
    run(() =>
      api.post<SeatAllocation>('/seat-allocations/release', {
        allocation_id: seat.allocation_id,
        release_date: startDate,
      }),
    );

  // Taking a seat out of service is a status change, not an allocation event,
  // so it goes through the seat resource rather than /seat-allocations. The
  // API refuses it while an allocation is active, which is why the button is
  // only offered for an unoccupied seat.
  const setStatus = (status: 'MAINTENANCE' | 'AVAILABLE') =>
    run(() => api.patch(`/seats/${seat.id}`, { status }));

  const title = {
    overview: `Seat ${seat.seat_number}`,
    allocate: `Allocate seat ${seat.seat_number}`,
    transfer: `Transfer from seat ${seat.seat_number}`,
    release: `Release seat ${seat.seat_number}`,
    maintenance: `Put seat ${seat.seat_number} under maintenance`,
    restore: `Return seat ${seat.seat_number} to service`,
  }[mode];

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        mode === 'overview' ? (
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={() => setMode('overview')} disabled={loading}>
              Back
            </Button>
            <Button
              onClick={
                mode === 'allocate'
                  ? allocate
                  : mode === 'transfer'
                    ? transfer
                    : mode === 'maintenance'
                      ? () => setStatus('MAINTENANCE')
                      : mode === 'restore'
                        ? () => setStatus('AVAILABLE')
                        : release
              }
              loading={loading}
              variant={mode === 'release' || mode === 'maintenance' ? 'danger' : 'primary'}
              disabled={
                (mode === 'allocate' && !studentId) ||
                (mode === 'transfer' && !targetSeatId)
              }
            >
              {mode === 'allocate'
                ? 'Allocate'
                : mode === 'transfer'
                  ? 'Transfer'
                  : mode === 'maintenance'
                    ? 'Put under maintenance'
                    : mode === 'restore'
                      ? 'Return to service'
                      : 'Release seat'}
            </Button>
          </>
        )
      }
    >
      {error && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {error}
        </div>
      )}

      {mode === 'maintenance' && (
        <p className="text-sm text-content-muted">
          Seat <span className="font-medium text-content">{seat.seat_number}</span> will be
          taken out of service and cannot be allocated until it is returned. Existing
          allocation history is kept.
        </p>
      )}

      {mode === 'restore' && (
        <p className="text-sm text-content-muted">
          Seat <span className="font-medium text-content">{seat.seat_number}</span> will become
          available for allocation again.
        </p>
      )}

      {mode === 'overview' && (
        <div className="space-y-4">
          <dl className="space-y-2.5 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-content-muted">Status</dt>
              <dd>
                <StatusBadge status={seat.status} />
              </dd>
            </div>
            <Row label="Floor" value={seat.floor ?? '—'} />
            <Row label="Section" value={seat.section ?? '—'} />
            <Row label="Type" value={seat.seat_type} />
            {seat.student_name && (
              <>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-content-muted">Occupied by</dt>
                  <dd>
                    <Link
                      href={`/students/${seat.student_id}`}
                      className="font-medium text-brand hover:underline"
                    >
                      {seat.student_name}
                    </Link>
                  </dd>
                </div>
                <Row label="Student code" value={seat.student_code ?? '—'} />
                <Row
                  label="Allocated until"
                  value={
                    seat.allocation_end_date
                      ? formatDate(seat.allocation_end_date)
                      : 'Open-ended'
                  }
                />
              </>
            )}
          </dl>

          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            {!seat.allocation_id && seat.status !== 'MAINTENANCE' && seat.status !== 'INACTIVE' && (
              <Button size="sm" onClick={() => setMode('allocate')}>
                Allocate to student
              </Button>
            )}
            {seat.allocation_id && (
              <>
                <Button size="sm" variant="secondary" onClick={() => setMode('transfer')}>
                  Transfer
                </Button>
                <Button size="sm" variant="danger" onClick={() => setMode('release')}>
                  Release
                </Button>
              </>
            )}
            {/* Taking a seat out of service is seat configuration rather than
                a day-to-day allocation, so it needs SEAT_MANAGE — the same
                permission the API enforces on PATCH /seats/:id. */}
            {canManageSeats && !seat.allocation_id && seat.status !== 'MAINTENANCE' && (
              <Button size="sm" variant="secondary" onClick={() => setMode('maintenance')}>
                Mark under maintenance
              </Button>
            )}

            {canManageSeats && seat.status === 'MAINTENANCE' && (
              <Button size="sm" onClick={() => setMode('restore')}>
                Return to service
              </Button>
            )}

            {seat.allocation_id && (seat.status !== 'MAINTENANCE') && canManageSeats && (
              <p className="w-full text-xs text-content-muted">
                Release this seat before putting it under maintenance.
              </p>
            )}

            {!canManageSeats &&
              (seat.status === 'MAINTENANCE' || seat.status === 'INACTIVE') && (
                <p className="text-sm text-content-muted">
                  This seat is {seat.status.toLowerCase()} and cannot be allocated. A branch
                  admin can change its status.
                </p>
              )}
          </div>
        </div>
      )}

      {mode === 'allocate' && (
        <div className="space-y-4">
          <SelectField
            label="Student"
            required
            value={studentId}
            onChange={(event) => setStudentId(event.target.value)}
            placeholder={students.length === 0 ? 'Loading students…' : 'Select a student'}
            options={students.map((student) => ({
              value: student.id,
              label: `${student.full_name} · ${student.student_code}`,
            }))}
            hint="Only active students in this branch are listed."
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <InputField
              label="Start date"
              type="date"
              required
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
            <InputField
              label="End date"
              type="date"
              value={endDate}
              min={startDate}
              onChange={(event) => setEndDate(event.target.value)}
              hint="Leave blank for open-ended."
            />
          </div>
        </div>
      )}

      {mode === 'transfer' && (
        <div className="space-y-4">
          <SelectField
            label="New seat"
            required
            value={targetSeatId}
            onChange={(event) => setTargetSeatId(event.target.value)}
            placeholder={
              availableSeats.length === 0 ? 'Loading available seats…' : 'Select a seat'
            }
            options={availableSeats.map((candidate) => ({
              value: candidate.id,
              label: `${candidate.seat_number}${candidate.floor ? ` · ${candidate.floor}` : ''}`,
            }))}
          />
          <InputField
            label="Effective from"
            type="date"
            required
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            hint="The current allocation closes the day before this date."
          />
        </div>
      )}

      {mode === 'release' && (
        <div className="space-y-4">
          <p className="text-sm text-content-muted">
            Releasing ends {seat.student_name ?? 'this student'}&rsquo;s allocation and returns
            the seat to the pool. The allocation stays in history.
          </p>
          <InputField
            label="Release date"
            type="date"
            required
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </div>
      )}
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-content-muted">{label}</dt>
      <dd className="text-content">{value}</dd>
    </div>
  );
}
