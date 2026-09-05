'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { InputField } from '@/components/ui/Field';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);

    await getSupabaseBrowserClient().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    // Always reports success, whether or not the address has an account.
    setSent(true);
    setLoading(false);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-sunken px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="card p-6">
          <h1 className="text-lg font-semibold text-content">Reset your password</h1>

          {sent ? (
            <div className="mt-4 space-y-4">
              <p className="text-sm text-content-muted">
                If an account exists for <span className="font-medium text-content">{email}</span>,
                a reset link is on its way. The link expires in one hour.
              </p>
              <Link href="/login">
                <Button variant="secondary" className="w-full">
                  Back to sign in
                </Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <p className="text-sm text-content-muted">
                Enter your work email and we will send you a link to set a new password.
              </p>

              <InputField
                label="Email"
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />

              <Button type="submit" loading={loading} className="w-full">
                Send reset link
              </Button>

              <div className="text-center">
                <Link
                  href="/login"
                  className="text-sm text-brand underline-offset-4 hover:underline"
                >
                  Back to sign in
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
