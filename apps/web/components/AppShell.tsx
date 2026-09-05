'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import clsx from 'clsx';
import { Permission } from '@manas/shared';
import { useSession } from './SessionProvider';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { initials } from '@/lib/format';
import { Button } from './ui/Button';
import { GlobalSearch } from './GlobalSearch';
import { BranchSwitcher } from './BranchSwitcher';

interface NavItem {
  href: string;
  label: string;
  icon: string;
  permission?: Permission;
  superAdminOnly?: boolean;
}

const NAV_SECTIONS: Array<{ title: string; items: NavItem[] }> = [
  {
    title: 'Overview',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: '◧' },
      { href: '/branches', label: 'Branches', icon: '⌂', superAdminOnly: true },
    ],
  },
  {
    title: 'Operations',
    items: [
      { href: '/students', label: 'Students', icon: '☺', permission: Permission.STUDENT_VIEW },
      {
        href: '/admissions',
        label: 'Admissions',
        icon: '✎',
        permission: Permission.ADMISSION_MANAGE,
      },
      { href: '/seats', label: 'Seats', icon: '▦', permission: Permission.SEAT_ALLOCATE },
      { href: '/batches', label: 'Batches', icon: '◷', permission: Permission.BATCH_MANAGE },
      {
        href: '/attendance',
        label: 'Attendance',
        icon: '✓',
        permission: Permission.ATTENDANCE_MANAGE,
      },
    ],
  },
  {
    title: 'Finance',
    items: [
      { href: '/invoices', label: 'Invoices', icon: '≣', permission: Permission.INVOICE_VIEW },
      { href: '/payments', label: 'Payments', icon: '₹', permission: Permission.INVOICE_VIEW },
      { href: '/fees', label: 'Fees & reminders', icon: '⏰', permission: Permission.INVOICE_VIEW },
    ],
  },
  {
    title: 'Administration',
    items: [
      { href: '/reports', label: 'Reports', icon: '▤', permission: Permission.REPORT_VIEW },
      { href: '/users', label: 'Users', icon: '⚇', permission: Permission.USER_MANAGE },
      { href: '/settings', label: 'Settings', icon: '⚙' },
    ],
  },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, can, isSuperAdmin } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
  }, []);

  // Any navigation closes the mobile drawer.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('manas-theme', next ? 'dark' : 'light');
    } catch {
      // Private browsing can block storage; the toggle still works for the session.
    }
  }

  async function signOut() {
    await getSupabaseBrowserClient().auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  const visibleSections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => {
      if (item.superAdminOnly && !isSuperAdmin) return false;
      if (item.permission && !can(item.permission)) return false;
      return true;
    }),
  })).filter((section) => section.items.length > 0);

  const nav = (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4 scrollbar-thin">
      {visibleSections.map((section) => (
        <div key={section.title}>
          <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-content-subtle">
            {section.title}
          </p>
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(`${item.href}/`);

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={clsx(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                      active
                        ? 'bg-brand-subtle font-medium text-brand'
                        : 'text-content-muted hover:bg-surface-sunken hover:text-content',
                    )}
                  >
                    <span aria-hidden className="w-4 text-center opacity-70">
                      {item.icon}
                    </span>
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-surface lg:flex">
        <div className="flex h-14 items-center gap-2.5 border-b border-border px-5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand text-sm font-bold text-white">
            M
          </span>
          <span className="text-sm font-semibold tracking-tight text-content">
            Manas Library
          </span>
        </div>
        {nav}
        <div className="border-t border-border p-3">
          <UserCard name={user.full_name} email={user.email} role={user.role} />
          <div className="mt-2 flex gap-2">
            <Button variant="ghost" size="sm" onClick={toggleTheme} className="flex-1">
              {dark ? '☀ Light' : '☾ Dark'}
            </Button>
            <Button variant="ghost" size="sm" onClick={signOut} className="flex-1">
              Sign out
            </Button>
          </div>
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <aside className="relative flex h-full w-72 flex-col border-r border-border bg-surface">
            <div className="flex h-14 items-center justify-between border-b border-border px-4">
              <span className="text-sm font-semibold text-content">Manas Library</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation"
              >
                ✕
              </Button>
            </div>
            {nav}
            <div className="border-t border-border p-3">
              <UserCard name={user.full_name} email={user.email} role={user.role} />
              <div className="mt-2 flex gap-2">
                <Button variant="ghost" size="sm" onClick={toggleTheme} className="flex-1">
                  {dark ? '☀ Light' : '☾ Dark'}
                </Button>
                <Button variant="ghost" size="sm" onClick={signOut} className="flex-1">
                  Sign out
                </Button>
              </div>
            </div>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur lg:px-6">
          <Button
            variant="ghost"
            size="sm"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            ☰
          </Button>
          <BranchSwitcher />
          <div className="ml-auto flex items-center gap-2">
            <GlobalSearch />
          </div>
        </header>

        <main className="flex-1 px-4 py-6 lg:px-6 lg:py-8">
          <div className="mx-auto w-full max-w-[100rem]">{children}</div>
        </main>
      </div>
    </div>
  );
}

function UserCard({ name, email, role }: { name: string; email: string; role: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
      <span
        aria-hidden
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-xs font-semibold text-brand"
      >
        {initials(name)}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-content">{name}</p>
        <p className="truncate text-xs text-content-subtle" title={email}>
          {role.replace('_', ' ').toLowerCase()}
        </p>
      </div>
    </div>
  );
}
