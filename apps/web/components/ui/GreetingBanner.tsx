'use client';

import { useSession } from '../SessionProvider';
import { Icon } from './Icon';

/**
 * Dashboard welcome banner.
 *
 * The name comes from session context rather than a second /users/me call —
 * the layout has already fetched it. The greeting word is computed by the
 * server and passed in: deriving it here from `new Date()` would let a
 * request that straddles noon render "Good morning" on the server and "Good
 * afternoon" in the browser, which React reports as a hydration mismatch.
 */
export function GreetingBanner({
  greeting,
  subtitle,
}: {
  greeting: string;
  subtitle: string;
}) {
  const { user } = useSession();
  const firstName = user.full_name.split(/\s+/)[0] ?? user.full_name;

  return (
    <section className="relative mb-4 overflow-hidden rounded-card bg-gradient-to-r from-brand to-brand-hover px-5 py-4 text-white sm:mb-6 sm:px-7 sm:py-6">
      {/* Decorative only; hidden from assistive tech. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-20 right-24 h-40 w-40 rounded-full bg-white/10 blur-2xl"
      />

      <div className="relative flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-lg font-bold tracking-tight sm:text-2xl">
            {greeting}, {firstName}! <span aria-hidden>👋</span>
          </p>
          <p className="mt-0.5 text-xs text-white/80 sm:mt-1 sm:text-sm">{subtitle}</p>
        </div>

        <span
          aria-hidden
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white sm:h-14 sm:w-14"
        >
          <Icon name="attendance" className="h-5 w-5 sm:h-7 sm:w-7" />
        </span>
      </div>
    </section>
  );
}
