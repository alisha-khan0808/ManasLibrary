'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { InputField } from '@/components/ui/Field';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

/**
 * Landing page for the Supabase recovery link. Supabase establishes a
 * short-lived recovery session from the URL fragment; the user then sets their
 * own password. This app never sees or stores a password itself.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') setReady(true);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password.length < 10) {
      setError('Use at least 10 characters.');
      return;
    }
    if (password !== confirmation) {
      setError('The two passwords do not match.');
      return;
    }

    setLoading(true);
    const { error: updateError } = await getSupabaseBrowserClient().auth.updateUser({
      password,
    });

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    router.replace('/dashboard');
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-sunken px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="card p-6">
          <h1 className="text-lg font-semibold text-content">Choose a new password</h1>

          {!ready ? (
            <p className="mt-4 text-sm text-content-muted">
              Checking your reset link… If nothing happens, request a new link from the sign-in
              page.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              {error && (
                <div
                  role="alert"
                  className="rounded-lg border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger"
                >
                  {error}
                </div>
              )}

              <InputField
                label="New password"
                type="password"
                autoComplete="new-password"
                required
                hint="At least 10 characters."
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />

              <InputField
                label="Confirm new password"
                type="password"
                autoComplete="new-password"
                required
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />

              <Button type="submit" loading={loading} className="w-full">
                Update password
              </Button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
