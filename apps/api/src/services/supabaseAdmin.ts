import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { env } from '../config/env';

/**
 * `ws` is behaviourally compatible with the browser WebSocket that
 * supabase-js expects, but its constructor signature is wider, so the two
 * types do not overlap structurally. The expected type is derived from the
 * public `createClient` signature rather than asserted as `any`, so this
 * breaks loudly if the option is ever renamed or removed upstream.
 */
type RealtimeTransport = NonNullable<
  NonNullable<Parameters<typeof createClient>[2]>['realtime']
>['transport'];

/**
 * Service-role Supabase client.
 *
 * Used only for identity operations that must go through Supabase Auth
 * (creating users, sending recovery links, disabling accounts). All business
 * data goes through the `pg` pool so it can participate in transactions.
 *
 * This client bypasses Row Level Security. It must never be constructed in,
 * or its key exposed to, frontend code.
 */
export const supabaseAdmin: SupabaseClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    // supabase-js builds a Realtime client in its constructor and expects a
    // global WebSocket, which Node only provides from v22. The API never uses
    // Realtime — that is the browser's job — but the client cannot be
    // constructed without a transport, so one is supplied explicitly. This
    // keeps the server running on Node 18 and 20 as well as 22.
    realtime: { transport: WebSocket as unknown as RealtimeTransport },
  },
);
