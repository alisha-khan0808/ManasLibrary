import pino from 'pino';
import { env, isProduction } from '../config/env';

/**
 * Structured logging. Redaction is deliberately broad — anything resembling a
 * credential must never reach the log stream or Railway's log drain.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.password',
      'req.body.newPassword',
      'req.body.currentPassword',
      'res.headers["set-cookie"]',
      '*.password',
      '*.apiKey',
      '*.serviceRoleKey',
      '*.token',
    ],
    censor: '[redacted]',
  },
  ...(isProduction
    ? {}
    : {
        transport: {
          target: 'pino/file',
          options: { destination: 1 },
        },
      }),
});

export type Logger = typeof logger;
