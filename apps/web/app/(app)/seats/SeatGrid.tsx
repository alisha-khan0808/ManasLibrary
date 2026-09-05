'use client';

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import type { SeatStatus } from '@manas/shared';
import type { SeatWithOccupant } from './page';
import { Card } from '@/components/ui/Card';
import { SeatActionDialog } from './SeatActionDialog';
import { formatDate } from '@/lib/format';

/**
 * Visual seat map (PRD §37).
 *
 * Status is conveyed three ways — colour, a glyph, and text in the tooltip and
 * legend — so the map is readable without relying on colour perception.
 */

const STATUS_STYLES: Record<SeatStatus, { tile: string; glyph: string; label: string }> = {
  AVAILABLE: {
    tile: 'border-positive/40 bg-positive-subtle text-positive hover:border-positive',
    glyph: '○',
    label: 'Available',
  },
  OCCUPIED: {
    tile: 'border-brand/50 bg-brand-subtle text-brand hover:border-brand',
    glyph: '●',
    label: 'Occupied',
  },
  RESERVED: {
    tile: 'border-info/40 bg-info-subtle text-info hover:border-info',
    glyph: '◐',
    label: 'Reserved',
  },
  MAINTENANCE: {
    tile: 'border-warning/40 bg-warning-subtle text-warning hover:border-warning',
    glyph: '⚒',
    label: 'Maintenance',
  },
  INACTIVE: {
    tile: 'border-border bg-surface-sunken text-content-subtle',
    glyph: '×',
    label: 'Inactive',
  },
};

export function SeatGrid({
  seats,
  floors,
}: {
  seats: SeatWithOccupant[];
  floors: string[];
}) {
  const [selected, setSelected] = useState<SeatWithOccupant | null>(null);

  const counts = useMemo(() => {
    const tally: Record<string, number> = {};
    for (const seat of seats) tally[seat.status] = (tally[seat.status] ?? 0) + 1;
    return tally;
  }, [seats]);

  const byFloor = useMemo(() => {
    const map = new Map<string, SeatWithOccupant[]>();
    for (const seat of seats) {
      const key = seat.floor ?? 'Unassigned';
      const list = map.get(key) ?? [];
      list.push(seat);
      map.set(key, list);
    }
    return map;
  }, [seats]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(Object.keys(STATUS_STYLES) as SeatStatus[]).map((status) => (
          <span
            key={status}
            className={clsx(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs',
              STATUS_STYLES[status].tile,
            )}
          >
            <span aria-hidden>{STATUS_STYLES[status].glyph}</span>
            {STATUS_STYLES[status].label}
            <span className="font-semibold tabular-nums">{counts[status] ?? 0}</span>
          </span>
        ))}
      </div>

      <div className="space-y-4">
        {floors.map((floor) => {
          const floorSeats = byFloor.get(floor) ?? [];
          if (floorSeats.length === 0) return null;

          return (
            <Card key={floor} title={floor === 'Unassigned' ? 'Seats' : `${floor} floor`}>
              <div
                role="grid"
                aria-label={`Seat map for ${floor}`}
                className="grid grid-cols-[repeat(auto-fill,minmax(5.25rem,1fr))] gap-2"
              >
                {floorSeats.map((seat) => {
                  const style = STATUS_STYLES[seat.status];

                  return (
                    <button
                      key={seat.id}
                      type="button"
                      onClick={() => setSelected(seat)}
                      title={
                        seat.student_name
                          ? `${seat.seat_number} — ${style.label}: ${seat.student_name}`
                          : `${seat.seat_number} — ${style.label}`
                      }
                      aria-label={
                        seat.student_name
                          ? `Seat ${seat.seat_number}, ${style.label}, occupied by ${seat.student_name}`
                          : `Seat ${seat.seat_number}, ${style.label}`
                      }
                      className={clsx(
                        'flex flex-col items-start gap-0.5 rounded-lg border px-2.5 py-2 text-left transition-colors',
                        style.tile,
                      )}
                    >
                      <span className="flex w-full items-center justify-between gap-1">
                        <span className="text-sm font-semibold tabular-nums">
                          {seat.seat_number}
                        </span>
                        <span aria-hidden className="text-xs opacity-80">
                          {style.glyph}
                        </span>
                      </span>
                      <span className="w-full truncate text-[11px] opacity-90">
                        {seat.student_name ?? style.label}
                      </span>
                      {seat.allocation_end_date && (
                        <span className="w-full truncate text-[10px] opacity-70">
                          till {formatDate(seat.allocation_end_date)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>

      {selected && (
        <SeatActionDialog seat={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}
