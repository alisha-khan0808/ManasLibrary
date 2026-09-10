'use client';

import Link from 'next/link';
import clsx from 'clsx';
import { Permission } from '@manas/shared';
import { useSession } from '../SessionProvider';
import type { Accent } from './Card';
import { Icon, type IconName } from './Icon';

interface QuickAction {
  label: string;
  href: string;
  icon: IconName;
  accent: Accent;
  permission?: Permission;
}

/**
 * The handful of things staff start from, as a tap grid.
 *
 * On a phone the sidebar is behind a tab bar and a drawer, so the common
 * destinations are surfaced here instead of being two taps away. Entries the
 * signed-in role cannot use are removed rather than shown disabled — an
 * action that only fails is worse than one that is absent.
 */
const ACTIONS: QuickAction[] = [
  {
    label: 'New admission',
    href: '/admissions/new',
    icon: 'admissions',
    accent: 'blue',
    permission: Permission.ADMISSION_MANAGE,
  },
  {
    label: 'Seat allocation',
    href: '/seats',
    icon: 'seat',
    accent: 'purple',
    permission: Permission.SEAT_ALLOCATE,
  },
  {
    label: 'Fee reminder',
    href: '/fees',
    icon: 'bell',
    accent: 'amber',
    permission: Permission.INVOICE_VIEW,
  },
  {
    label: 'Add payment',
    href: '/payments',
    icon: 'payment',
    accent: 'green',
    permission: Permission.PAYMENT_RECORD,
  },
  {
    label: 'Reports',
    href: '/reports',
    icon: 'report',
    accent: 'teal',
    permission: Permission.REPORT_VIEW,
  },
  {
    label: 'Students',
    href: '/students',
    icon: 'students',
    accent: 'rose',
    permission: Permission.STUDENT_VIEW,
  },
  { label: 'Attendance', href: '/attendance', icon: 'attendance', accent: 'blue' },
  { label: 'Settings', href: '/settings', icon: 'settings', accent: 'amber' },
];

export function QuickActions() {
  const { can } = useSession();
  const visible = ACTIONS.filter((action) => !action.permission || can(action.permission));

  if (visible.length === 0) return null;

  return (
    <section className="card overflow-hidden">
      <header className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-content">Quick actions</h2>
      </header>

      <div className="grid grid-cols-4 gap-2 p-3 sm:gap-3 sm:p-4">
        {visible.map((action) => (
          <Link
            key={action.href + action.label}
            href={action.href}
            className={clsx(
              `accent-${action.accent}`,
              'flex flex-col items-center gap-1.5 rounded-xl px-1 py-3 text-center transition-colors hover:bg-surface-sunken',
            )}
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-chip text-accent">
              <Icon name={action.icon} />
            </span>
            <span className="text-[11px] font-medium leading-tight text-content-muted">
              {action.label}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
