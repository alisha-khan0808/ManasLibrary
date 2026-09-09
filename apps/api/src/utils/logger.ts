import pino from 'pino';
import { env, isProduction } from '../config/env';

/**
 * True inside a Lambda-style function container (Netlify Functions, AWS
 * Lambda). Detected from the runtime's own variables rather than NODE_ENV,
 * which is not reliably set at function runtime.
 */
const isServerless = Boolean(
  process.env.AWS_LAMBDA_FUNCTION_NAME ??
    process.env.LAMBDA_TASK_ROOT ??
    process.env.NETLIFY,
);

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
  // A pino transport runs in a worker thread. That is fine for a long-lived
  // server, but a serverless container is frozen and thawed between
  // invocations and the worker does not survive it — the runtime dies with
  // "exit status 129" (SIGHUP) on a cold start, intermittently, which is
  // miserable to diagnose. Write synchronously to stdout there instead; the
  // platform captures it either way.
  ...(isProduction || isServerless
    ? {}
    : {
        transport: {
          target: 'pino/file',
          options: { destination: 1 },
        },
      }),
});

export type Logger = typeof logger;
