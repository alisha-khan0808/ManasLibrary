import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

// Load apps/api/.env first, then fall back to the repo-root .env so a single
// file can drive the whole monorepo in development.
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const booleanish = z
  .string()
  .transform((value) => value.trim().toLowerCase())
  .pipe(z.enum(['true', 'false', '1', '0']))
  .transform((value) => value === 'true' || value === '1');

const csv = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
  );

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_SSL: booleanish.default('true'),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().max(100).default(10),

  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_JWT_SECRET: z.string().optional(),

  CORS_ORIGINS: csv.default('http://localhost:3000'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),

  JOBS_ENABLED: booleanish.default('true'),
  JOB_FEE_REMINDERS_CRON: z.string().default('0 8 * * *'),
  JOB_MEMBERSHIP_EXPIRY_CRON: z.string().default('15 0 * * *'),
  JOB_BIOMETRIC_SYNC_CRON: z.string().default('*/15 * * * *'),

  NOTIFICATION_PROVIDER: z.enum(['none', 'log', 'webhook']).default('log'),
  NOTIFICATION_API_URL: z.string().optional(),
  NOTIFICATION_API_KEY: z.string().optional(),

  BIOMETRIC_PROVIDER: z.enum(['none', 'http']).default('none'),
  BIOMETRIC_API_URL: z.string().optional(),
  BIOMETRIC_API_KEY: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

function load(): Env {
  const parsed = schema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    // Fail loudly at boot rather than surfacing confusing runtime errors.
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  const env = parsed.data;

  if (env.NOTIFICATION_PROVIDER === 'webhook' && !env.NOTIFICATION_API_URL) {
    throw new Error('NOTIFICATION_API_URL is required when NOTIFICATION_PROVIDER=webhook');
  }
  if (env.BIOMETRIC_PROVIDER === 'http' && !env.BIOMETRIC_API_URL) {
    throw new Error('BIOMETRIC_API_URL is required when BIOMETRIC_PROVIDER=http');
  }

  return env;
}

export const env = load();

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
