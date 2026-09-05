import type { Metadata } from 'next';
import type { Seat } from '@manas/shared';
import { apiFetchSafe } from '@/lib/api';
import { Card, PageHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { SeatGrid } from './SeatGrid';
import { SeatToolbar } from './SeatToolbar';

export const metadata: Metadata = { title: 'Seats' };

export interface SeatWithOccupant extends Seat {
  allocation_id: string | null;
  student_id: string | null;
  student_name: string | null;
  student_code: string | null;
  allocation_end_date: string | null;
}

export default async function SeatsPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const seats = await apiFetchSafe<SeatWithOccupant[]>(
    '/seats',
    {
      query: {
        branchId: searchParams.branchId,
        status: searchParams.status,
        floor: searchParams.floor,
        section: searchParams.section,
      },
    },
    [],
  );

  const floors = Array.from(
    new Set(seats.data.map((seat) => seat.floor ?? 'Unassigned')),
  ).sort();

  return (
    <>
      <PageHeader
        title="Seats"
        description="Live seat map for the selected branch. Click a seat to allocate, transfer or release it."
        action={<SeatToolbar branchId={searchParams.branchId} />}
      />

      {seats.error ? (
        <Card>
          <EmptyState tone="danger" title="Could not load seats" description={seats.error} />
        </Card>
      ) : seats.data.length === 0 ? (
        <Card>
          <EmptyState
            title="No seats configured"
            description={
              searchParams.branchId
                ? 'Add seats for this branch to start allocating them.'
                : 'Select a branch and add seats to start allocating them.'
            }
          />
        </Card>
      ) : (
        <SeatGrid seats={seats.data} floors={floors} />
      )}
    </>
  );
}
