'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from './ui/Button';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

/**
 * Shown when the browser holds a valid Supabase session but the API refuses
 * it — an account that was never provisioned, deactivated since sign-in, or
 * a token the API cannot verify.
 *
 * This deliberately does NOT redirect. Bouncing to /login would be undone
 * immediately by the middleware, which sees a live session and sends the user
 * back, producing an infinite redirect loop. Clearing the session is the only
 * action that actually resolves the state, so the user is asked to take it.
 */
export function SessionRecovery({ message }: { message: string }) {
  const router = useRouter();
  const [working, setWorking] = useState(false);

  async function signOut() {
    setWorking(true);
    try {
      await getSupabaseBrowserClient().auth.signOut();
    } finally {
      router.replace('/login');
      router.refresh();
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-sunken px-4">
      <div className="card max-w-md p-6 text-center">
        <h1 className="text-base font-semibold text-content">Your session was not accepted</h1>
        <p className="mt-2 text-sm text-content-muted">{message}</p>
        <p className="mt-2 text-sm text-content-muted">
          Signing out clears the stored session so you can sign in again.
        </p>
        <Button className="mt-4 w-full" onClick={signOut} loading={working}>
          Sign out
        </Button>
      </div>
    </main>
  );
}
