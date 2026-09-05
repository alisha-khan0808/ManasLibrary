import { Pool, types, type PoolClient, type QueryResultRow } from 'pg';
import { env } from '../config/env';
import { logger } from '../utils/logger';

/* --------------------------------------------------------------------------
 * Type parsers. Two defaults in node-postgres actively harm this domain:
 *   - `date` becomes a JS Date in the server's timezone, which can shift a
 *     membership end date by a day. Keep it as the YYYY-MM-DD string it is.
 *   - `numeric` is already returned as a string; that is what we want, since
 *     currency must never touch a float. Left untouched deliberately.
 * `bigint` counts are safely below 2^53 here, so they are parsed to numbers.
 * ----------------------------------------------------------------------- */
const OID_DATE = 1082;
const OID_INT8 = 20;

types.setTypeParser(OID_DATE, (value: string) => value);
types.setTypeParser(OID_INT8, (value: string) => Number.parseInt(value, 10));

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.DATABASE_POOL_MAX,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  // Supabase terminates TLS with a certificate chain the default Node trust
  // store does not include; verification is handled by the connection string's
  // host pinning. Set DATABASE_SSL=false for a local instance.
  ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : false,
});

pool.on('error', (error) => {
  logger.error({ err: error }, 'Unexpected error on idle database client');
});

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const started = Date.now();
  const result = await pool.query<T>(text, params as never[]);
  const duration = Date.now() - started;

  if (duration > 500) {
    logger.warn({ duration, rows: result.rowCount }, 'Slow query');
  }

  return result.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export type Db = Pick<PoolClient, 'query'>;

export async function checkConnection(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch (error) {
    logger.error({ err: error }, 'Database connectivity check failed');
    return false;
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}
