import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-sunken px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-brand text-lg font-bold text-white">
            M
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-content">Manas Library</h1>
          <p className="mt-1 text-sm text-content-muted">
            Sign in to your branch management console
          </p>
        </div>

        <div className="card p-6">
          <Suspense
            fallback={<div className="h-56 animate-pulse rounded-lg bg-surface-sunken" />}
          >
            <LoginForm />
          </Suspense>
        </div>

        <p className="mt-6 text-center text-xs text-content-subtle">
          Accounts are created by your administrator.
        </p>
      </div>
    </main>
  );
}
