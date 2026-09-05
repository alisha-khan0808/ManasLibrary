import { redirect } from 'next/navigation';
import type { AppUser, Branch } from '@manas/shared';
import { apiFetch, ApiRequestError } from '@/lib/api';
import { SessionProvider } from '@/components/SessionProvider';
import { AppShell } from '@/components/AppShell';

/**
 * Authenticated shell.
 *
 * Resolves the caller's profile and authorized branches from the API — never
 * from the JWT or client state — so the navigation reflects what the backend
 * will actually permit.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let user: AppUser;
  let branches: Branch[] = [];

  try {
    const profile = await apiFetch<AppUser>('/users/me');
    user = profile.data;
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 401) {
      redirect('/login');
    }

    return (
      <main className="flex min-h-screen items-center justify-center bg-surface-sunken px-4">
        <div className="card max-w-md p-6 text-center">
          <h1 className="text-base font-semibold text-content">Cannot reach the API</h1>
          <p className="mt-2 text-sm text-content-muted">
            {error instanceof ApiRequestError
              ? error.message
              : 'The management API did not respond. Check that it is running and that NEXT_PUBLIC_API_URL is correct.'}
          </p>
        </div>
      </main>
    );
  }

  try {
    const result = await apiFetch<Branch[]>('/branches', { query: { pageSize: 100 } });
    branches = result.data;
  } catch {
    // A user with no branch access still gets a usable shell and a clear
    // empty state on each screen, rather than a hard failure here.
    branches = [];
  }

  return (
    <SessionProvider user={user} branches={branches}>
      <AppShell>{children}</AppShell>
    </SessionProvider>
  );
}
