'use client';

import { createBrowserClient } from '@supabase/ssr';

/**
 * Browser Supabase client.
 *
 * Only ever receives the anon key — Row Level Security (migration 0010) is
 * what limits what this client can read, and it can write nothing. All writes
 * go through the Node API.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

/** Shared instance, so a page with several components keeps one session. */
export function getSupabaseBrowserClient() {
  if (!browserClient) browserClient = createClient();
  return browserClient;
}
