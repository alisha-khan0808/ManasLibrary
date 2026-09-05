import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env';

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
  },
);
