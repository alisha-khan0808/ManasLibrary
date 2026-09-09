import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { closePool, pool } from './pool';
import { logger } from '../utils/logger';

/**
 * Minimal forward-only migration runner.
 *
 * Each file runs inside its own transaction, and its checksum is recorded so a
 * migration that was edited after being applied is detected rather than
 * silently ignored.
 */

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../database/migrations');

interface AppliedMigration {
  name: string;
  checksum: string;
}

function readMigrationFiles(): Array<{ name: string; sql: string; checksum: string }> {
  return readdirSync(MIGRATIONS_DIR)
    // A leading underscore marks a file that is not itself a migration —
    // the concatenated bundle generated for manual Supabase runs, for
    // instance. Applying one would re-run every statement the numbered
    // files already applied.
    .filter((file) => file.endsWith('.sql') && !file.startsWith('_'))
    .sort()
    .map((name) => {
      const sql = readFileSync(path.join(MIGRATIONS_DIR, name), 'utf8');
      return {
        name,
        sql,
        checksum: createHash('sha256').update(sql).digest('hex').slice(0, 16),
      };
    });
}

async function ensureMigrationTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      name        text PRIMARY KEY,
      checksum    text NOT NULL,
      applied_at  timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function getApplied(): Promise<Map<string, string>> {
  const result = await pool.query<AppliedMigration>(
    'SELECT name, checksum FROM public.schema_migrations',
  );
  return new Map(result.rows.map((row) => [row.name, row.checksum]));
}

export async function up(): Promise<void> {
  await ensureMigrationTable();

  const applied = await getApplied();
  const files = readMigrationFiles();
  let ran = 0;

  for (const file of files) {
    const previousChecksum = applied.get(file.name);

    if (previousChecksum) {
      if (previousChecksum !== file.checksum) {
        throw new Error(
          `Migration ${file.name} has changed since it was applied. ` +
            'Create a new migration instead of editing an applied one.',
        );
      }
      continue;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(file.sql);
      await client.query(
        'INSERT INTO public.schema_migrations (name, checksum) VALUES ($1, $2)',
        [file.name, file.checksum],
      );
      await client.query('COMMIT');
      logger.info({ migration: file.name }, 'Applied migration');
      ran += 1;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error({ err: error, migration: file.name }, 'Migration failed — rolled back');
      throw error;
    } finally {
      client.release();
    }
  }

  logger.info({ applied: ran, total: files.length }, 'Migrations up to date');
}

export async function status(): Promise<void> {
  await ensureMigrationTable();
  const applied = await getApplied();

  for (const file of readMigrationFiles()) {
    const state = applied.has(file.name)
      ? applied.get(file.name) === file.checksum
        ? 'applied'
        : 'MODIFIED AFTER APPLY'
      : 'pending';
    logger.info({ migration: file.name, state }, 'Migration status');
  }
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? 'up';

  try {
    if (command === 'up') {
      await up();
    } else if (command === 'status') {
      await status();
    } else {
      throw new Error(`Unknown command "${command}". Use "up" or "status".`);
    }
  } finally {
    await closePool();
  }
}

if (require.main === module) {
  main().catch((error) => {
    logger.error({ err: error }, 'Migration run failed');
    process.exitCode = 1;
  });
}
