/**
 * Demo mode — UI preview without a backend.
 *
 * WHAT THIS IS: a way to click through the interface before Supabase and the
 * database exist. Every screen is served from static fixtures.
 *
 * WHAT THIS IS NOT: a working application. Demo mode exercises no
 * authentication, no branch isolation, no business rules, no transactions and
 * no persistence. Nothing you do in it is saved, and nothing it shows proves
 * the backend works.
 *
 * SAFETY: this cannot be switched on in a production build. `NODE_ENV` is
 * fixed at build time by `next build`, so the second condition below is
 * evaluated then and demo code is unreachable in a production bundle even if
 * someone sets the environment variable on the server.
 */
export const IS_DEMO_MODE =
  process.env.NEXT_PUBLIC_DEMO_MODE === 'true' && process.env.NODE_ENV !== 'production';

/**
 * Fails the build rather than shipping a bypass. Called from the root layout,
 * which is evaluated during `next build`.
 */
export function assertDemoModeIsSafe(): void {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === 'true' && process.env.NODE_ENV === 'production') {
    throw new Error(
      'NEXT_PUBLIC_DEMO_MODE=true is set in a production build. Demo mode bypasses ' +
        'authentication entirely and must never be deployed. Unset it and rebuild.',
    );
  }
}

/** The fictional signed-in user shown while demo mode is active. */
export const DEMO_USER_ID = '00000000-0000-4000-8000-000000000001';
