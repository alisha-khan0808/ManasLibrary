'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { InputField } from '@/components/ui/Field';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { IS_DEMO_MODE } from '@/lib/demo/config';

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get('next') ?? '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const { error: signInError } = await getSupabaseBrowserClient().auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError) {
      // A network failure is not a credential failure — telling someone to
      // check their password when the auth host is unreachable sends them
      // debugging the wrong thing.
      const unreachable =
        signInError.name === 'AuthRetryableFetchError' || signInError.status === 0;

      setError(
        unreachable
          ? 'Could not reach the authentication server. Check your connection and that Supabase is configured.'
          : // Otherwise deliberately generic: distinguishing "no such user"
            // from "wrong password" would let anyone enumerate staff accounts.
            'Those credentials did not work. Check your email and password.',
      );
      setLoading(false);
      return;
    }

    // A full refresh so the server layout re-reads the session cookie.
    router.replace(nextPath);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {error}
        </div>
      )}

      <InputField
        label="Email"
        type="email"
        name="email"
        autoComplete="username"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="you@manaslibrary.com"
      />

      <InputField
        label="Password"
        type="password"
        name="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />

      <Button type="submit" loading={loading} className="w-full" size="lg">
        Sign in
      </Button>

      <div className="text-center">
        <Link
          href="/forgot-password"
          className="text-sm text-brand underline-offset-4 hover:underline"
        >
          Forgot your password?
        </Link>
      </div>

      {IS_DEMO_MODE && (
        <div className="space-y-3 border-t border-border pt-4">
          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="w-full"
            onClick={() => {
              router.push('/dashboard');
              router.refresh();
            }}
          >
            Explore the demo
          </Button>
          <p className="text-center text-xs text-content-muted">
            Opens the interface with sample data. No sign-in, nothing saved.
          </p>
        </div>
      )}
    </form>
  );
}
