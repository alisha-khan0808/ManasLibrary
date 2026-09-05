import type { PoolClient, QueryResultRow } from 'pg';
import { pool } from './pool';
import { logger } from '../utils/logger';

/**
 * A transaction-scoped client. Every multi-table write (admission, seat
 * transfer, payment) must go through this so a failure leaves nothing behind
 * (PRD §16, §40).
 */
export interface Tx {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<T[]>;
  queryOne<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<T | null>;
  /** Escape hatch for code that needs the raw client (e.g. LISTEN). */
  readonly client: PoolClient;
}

function wrap(client: PoolClient): Tx {
  return {
    client,
    async query<T extends QueryResultRow = QueryResultRow>(
      text: string,
      params: unknown[] = [],
    ): Promise<T[]> {
      const result = await client.query<T>(text, params as never[]);
      return result.rows;
    },
    async queryOne<T extends QueryResultRow = QueryResultRow>(
      text: string,
      params: unknown[] = [],
    ): Promise<T | null> {
      const result = await client.query<T>(text, params as never[]);
      return result.rows[0] ?? null;
    },
  };
}

export async function withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await fn(wrap(client));
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      logger.error({ err: rollbackError }, 'Failed to roll back transaction');
    }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Serializable isolation for the few operations where a concurrent reader
 * could otherwise make a decision on stale data (batch capacity checks).
 */
export async function withSerializableTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    const result = await fn(wrap(client));
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      logger.error({ err: rollbackError }, 'Failed to roll back transaction');
    }
    throw error;
  } finally {
    client.release();
  }
}
