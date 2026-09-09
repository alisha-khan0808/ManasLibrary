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
    <section className="accent-purple relative mb-5 overflow-hidden rounded-card border border-border/70 bg-gradient-to-r from-brand-subtle via-surface-raised to-accent-soft px-5 py-5 sm:mb-6 sm:px-7 sm:py-6">
      {/* Decorative only; hidden from assistive tech. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-brand/10 blur-2xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-20 right-24 h-40 w-40 rounded-full bg-accent/10 blur-2xl"
      />

      <div className="relative flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xl font-bold tracking-tight text-content sm:text-2xl">
            <span aria-hidden>👋 </span>
            {greeting}, {firstName}!
          </p>
          <p className="mt-1 text-sm text-content-muted">{subtitle}</p>
        </div>

        <span
          aria-hidden
          className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-surface-raised/80 text-brand shadow-card sm:flex"
        >
          <Icon name="chart" className="h-7 w-7" />
        </span>
      </div>
    </section>
  );
}
