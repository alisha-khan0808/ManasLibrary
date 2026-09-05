import { closePool } from './pool';
import { withTransaction } from './transaction';
import { supabaseAdmin } from '../services/supabaseAdmin';
import { logger } from '../utils/logger';

/**
 * Development seed.
 *
 * Creates a franchise-wide Super Admin plus one fully-configured branch so the
 * application is usable immediately after migrations. Safe to re-run: every
 * insert is conditional.
 *
 * Usage:
 *   SEED_ADMIN_EMAIL=you@example.com npm run seed -w @manas/api
 *
 * No password is set here — the Super Admin receives a Supabase invite/reset
 * link and chooses their own. Passwords are never written by this codebase.
 */

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@manaslibrary.local';
const ADMIN_NAME = process.env.SEED_ADMIN_NAME ?? 'Franchise Super Admin';

async function ensureSuperAdmin(): Promise<string> {
  const { data: list, error: listError } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });

  if (listError) {
    throw new Error(`Could not list Supabase users: ${listError.message}`);
  }

  const existing = list.users.find(
    (user) => user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase(),
  );

  if (existing) {
    logger.info({ email: ADMIN_EMAIL }, 'Super Admin identity already exists');
    return existing.id;
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: ADMIN_EMAIL,
    email_confirm: true,
    user_metadata: { full_name: ADMIN_NAME },
  });

  if (error || !data.user) {
    throw new Error(`Could not create Super Admin: ${error?.message ?? 'unknown error'}`);
  }

  logger.info({ email: ADMIN_EMAIL }, 'Super Admin identity created');
  return data.user.id;
}

async function main(): Promise<void> {
  const authUserId = await ensureSuperAdmin();

  await withTransaction(async (tx) => {
    await tx.query(
      `INSERT INTO public.users (id, email, full_name, role)
       VALUES ($1, $2, $3, 'SUPER_ADMIN'::user_role)
       ON CONFLICT (id) DO UPDATE SET role = 'SUPER_ADMIN'::user_role, status = 'ACTIVE'`,
      [authUserId, ADMIN_EMAIL, ADMIN_NAME],
    );

    const plans = [
      ['Monthly', 30, '1200.00', 'One month of library access'],
      ['Quarterly', 90, '3300.00', 'Three months, discounted'],
      ['Half-Yearly', 180, '6000.00', 'Six months, better value'],
      ['Yearly', 365, '11000.00', 'Best value for regular students'],
    ] as const;

    for (const [name, days, price, description] of plans) {
      await tx.query(
        `INSERT INTO public.membership_plans (name, duration_days, price, description)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (name) DO NOTHING`,
        [name, days, price, description],
      );
    }

    const branch = await tx.queryOne<{ id: string }>(
      `INSERT INTO public.branches
         (branch_code, name, address, city, state, phone, email, opening_time, closing_time)
       VALUES ('MLB01', 'Manas Library — Main Branch', 'Station Road', 'Patna', 'Bihar',
               '9999900000', 'main@manaslibrary.local', '06:00', '22:00')
       ON CONFLICT (branch_code) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
    );

    const branchId = branch!.id;

    const batches = [
      ['Morning', '06:00', '10:00', 60],
      ['Afternoon', '12:00', '16:00', 60],
      ['Evening', '17:00', '21:00', 60],
    ] as const;

    for (const [name, start, end, capacity] of batches) {
      await tx.query(
        `INSERT INTO public.batches (branch_id, name, start_time, end_time, capacity)
         VALUES ($1, $2, $3::time, $4::time, $5)
         ON CONFLICT (branch_id, name) DO NOTHING`,
        [branchId, name, start, end, capacity],
      );
    }

    // Two rows of 20 seats, matching the grid layout the seat screen renders.
    for (const [prefix, floor] of [
      ['A', 'Ground'],
      ['B', 'First'],
    ] as const) {
      const numbers = Array.from({ length: 20 }, (_, i) => `${prefix}${String(i + 1).padStart(2, '0')}`);

      await tx.query(
        `INSERT INTO public.seats (branch_id, seat_number, floor, section)
         SELECT $1, n, $3, $4 FROM unnest($2::text[]) AS n
         ON CONFLICT (branch_id, seat_number) DO NOTHING`,
        [branchId, numbers, floor, prefix],
      );
    }

    logger.info({ branchId }, 'Seed branch, batches, seats and plans are in place');
  });

  logger.info(
    { email: ADMIN_EMAIL },
    'Seed complete. Use "Forgot password" on the login screen to set the Super Admin password.',
  );
}

main()
  .catch((error) => {
    logger.error({ err: error }, 'Seed failed');
    process.exitCode = 1;
  })
  .finally(() => closePool());
