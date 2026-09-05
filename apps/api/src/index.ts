import type { Server } from 'node:http';
import { createApp } from './app';
import { env } from './config/env';
import { checkConnection, closePool } from './database/pool';
import { startScheduler, stopScheduler } from './jobs/scheduler';
import { logger } from './utils/logger';

async function bootstrap(): Promise<void> {
  const app = createApp();

  // Verify database connectivity at boot so a misconfigured deployment fails
  // its health check immediately rather than on the first user request.
  const connected = await checkConnection();
  if (!connected) {
    logger.error('Could not reach the database at startup — check DATABASE_URL');
  }

  const server: Server = app.listen(env.PORT, () => {
    logger.info(
      { port: env.PORT, env: env.NODE_ENV },
      'Manas Library API listening',
    );
  });

  startScheduler();

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    stopScheduler();

    server.close(() => {
      closePool()
        .catch((error) => logger.error({ err: error }, 'Failed to close database pool'))
        .finally(() => process.exit(0));
    });

    // Railway sends SIGTERM before replacing an instance; do not hang forever
    // waiting for a stuck connection to drain.
    setTimeout(() => {
      logger.warn('Forcing shutdown after timeout');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'Unhandled promise rejection');
  });

  process.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'Uncaught exception — exiting');
    process.exit(1);
  });
}

bootstrap().catch((error) => {
  logger.fatal({ err: error }, 'Failed to start the API');
  process.exit(1);
});
