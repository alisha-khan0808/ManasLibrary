import { describe, expect, it } from 'vitest';
import { FeeReminderType, FeeScheduleStatus } from '@manas/shared';
import { deriveFeeStatus, reminderTypeFor } from '../src/domain/fees';
import { addDays, daysBetween, membershipEndDate, rangesOverlap } from '../src/domain/dates';

describe('deriveFeeStatus', () => {
  const today = '2026-06-15';

  it('is UPCOMING before the due date', () => {
    expect(deriveFeeStatus({ dueDate: '2026-06-20', today, isPaid: false })).toBe(
      FeeScheduleStatus.UPCOMING,
    );
  });

  it('is DUE on the due date', () => {
    expect(deriveFeeStatus({ dueDate: today, today, isPaid: false })).toBe(
      FeeScheduleStatus.DUE,
    );
  });

  it('is OVERDUE the day after', () => {
    expect(deriveFeeStatus({ dueDate: '2026-06-14', today, isPaid: false })).toBe(
      FeeScheduleStatus.OVERDUE,
    );
  });

  it('is PAID once settled, whatever the date', () => {
    expect(deriveFeeStatus({ dueDate: '2026-01-01', today, isPaid: true })).toBe(
      FeeScheduleStatus.PAID,
    );
  });

  it('cancellation outranks everything', () => {
    expect(
      deriveFeeStatus({ dueDate: '2026-01-01', today, isPaid: true, isCancelled: true }),
    ).toBe(FeeScheduleStatus.CANCELLED);
  });
});

describe('reminderTypeFor — idempotency depends on one type per day', () => {
  const today = '2026-06-15';

  it('sends nothing more than three days out', () => {
    expect(reminderTypeFor({ dueDate: '2026-06-19', today, isPaid: false })).toBeNull();
  });

  it('sends UPCOMING inside the window', () => {
    expect(reminderTypeFor({ dueDate: '2026-06-18', today, isPaid: false })).toBe(
      FeeReminderType.UPCOMING,
    );
    expect(reminderTypeFor({ dueDate: '2026-06-16', today, isPaid: false })).toBe(
      FeeReminderType.UPCOMING,
    );
  });

  it('sends DUE_TODAY on the day', () => {
    expect(reminderTypeFor({ dueDate: today, today, isPaid: false })).toBe(
      FeeReminderType.DUE_TODAY,
    );
  });

  it('sends OVERDUE afterwards', () => {
    expect(reminderTypeFor({ dueDate: '2026-06-01', today, isPaid: false })).toBe(
      FeeReminderType.OVERDUE,
    );
  });

  it('sends nothing for a paid or cancelled fee', () => {
    expect(reminderTypeFor({ dueDate: '2026-06-01', today, isPaid: true })).toBeNull();
    expect(
      reminderTypeFor({ dueDate: '2026-06-01', today, isPaid: false, isCancelled: true }),
    ).toBeNull();
  });
});

describe('dates', () => {
  it('computes an inclusive membership end date', () => {
    // A 30-day plan starting on the 1st runs through the 30th, not the 31st.
    expect(membershipEndDate('2026-01-01', 30)).toBe('2026-01-30');
    expect(membershipEndDate('2026-01-01', 1)).toBe('2026-01-01');
  });

  it('crosses month and leap-year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(daysBetween('2026-01-01', '2026-12-31')).toBe(364);
  });

  it('rejects an impossible calendar date', () => {
    expect(() => addDays('2026-02-30', 1)).toThrow();
  });

  it('detects overlapping allocation windows inclusively', () => {
    expect(rangesOverlap('2026-01-01', '2026-01-31', '2026-01-31', '2026-02-28')).toBe(true);
    expect(rangesOverlap('2026-01-01', '2026-01-31', '2026-02-01', '2026-02-28')).toBe(false);
    // An open-ended allocation blocks everything after it starts.
    expect(rangesOverlap('2026-01-01', null, '2030-01-01', null)).toBe(true);
  });
});
