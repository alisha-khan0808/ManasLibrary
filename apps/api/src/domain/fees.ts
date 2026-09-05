import { FeeReminderType, FeeScheduleStatus } from '@manas/shared';
import { daysBetween } from './dates';

/** How many days before the due date an "upcoming" reminder goes out. */
export const UPCOMING_REMINDER_WINDOW_DAYS = 3;

/**
 * Fee status is always derived, never stored by the client: an unpaid fee
 * silently becomes OVERDUE as the calendar moves, and no write happens on the
 * day it does.
 */
export function deriveFeeStatus(params: {
  dueDate: string;
  today: string;
  isPaid: boolean;
  isCancelled?: boolean;
}): FeeScheduleStatus {
  if (params.isCancelled) return FeeScheduleStatus.CANCELLED;
  if (params.isPaid) return FeeScheduleStatus.PAID;

  const daysUntilDue = daysBetween(params.today, params.dueDate);

  if (daysUntilDue < 0) return FeeScheduleStatus.OVERDUE;
  if (daysUntilDue === 0) return FeeScheduleStatus.DUE;
  return FeeScheduleStatus.UPCOMING;
}

/**
 * Decides which reminder (if any) a fee deserves today. Returning a single
 * type per day is what makes the reminder job idempotent: combined with the
 * (fee_schedule_id, reminder_type, reminder_date) unique index, re-running the
 * job cannot produce duplicates.
 */
export function reminderTypeFor(params: {
  dueDate: string;
  today: string;
  isPaid: boolean;
  isCancelled?: boolean;
}): FeeReminderType | null {
  if (params.isPaid || params.isCancelled) return null;

  const daysUntilDue = daysBetween(params.today, params.dueDate);

  if (daysUntilDue < 0) return FeeReminderType.OVERDUE;
  if (daysUntilDue === 0) return FeeReminderType.DUE_TODAY;
  if (daysUntilDue <= UPCOMING_REMINDER_WINDOW_DAYS) return FeeReminderType.UPCOMING;

  return null;
}

export function reminderMessage(params: {
  studentName: string;
  branchName: string;
  amount: string;
  dueDate: string;
  type: FeeReminderType;
}): string {
  const money = `INR ${params.amount}`;

  switch (params.type) {
    case FeeReminderType.UPCOMING:
      return `Hello ${params.studentName}, your ${params.branchName} library fee of ${money} is due on ${params.dueDate}.`;
    case FeeReminderType.DUE_TODAY:
      return `Hello ${params.studentName}, your ${params.branchName} library fee of ${money} is due today.`;
    case FeeReminderType.OVERDUE:
      return `Hello ${params.studentName}, your ${params.branchName} library fee of ${money} was due on ${params.dueDate} and is now overdue.`;
  }
}
