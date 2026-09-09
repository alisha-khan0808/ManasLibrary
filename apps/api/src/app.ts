import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import pinoHttp from 'pino-http';
import { env, isProduction } from './config/env';
import { logger } from './utils/logger';
import { checkConnection } from './database/pool';
import { requireAuth } from './middleware/auth';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { forbidden } from './utils/errors';
import { apiRateLimiter, requestContext } from './middleware/requestContext';

import { authRouter } from './modules/auth/auth.routes';
import { branchesRouter } from './modules/branches/branches.routes';
import { usersRouter } from './modules/users/users.routes';
import { studentsRouter } from './modules/students/students.routes';
import { membershipsRouter } from './modules/memberships/memberships.routes';
import { seatAllocationsRouter, seatsRouter } from './modules/seats/seats.routes';
import { batchesRouter } from './modules/batches/batches.routes';
import { admissionsRouter } from './modules/admissions/admissions.routes';
import { invoicesRouter, paymentsRouter } from './modules/finance/finance.routes';
import { feesRouter } from './modules/fees/fees.routes';
import { attendanceRouter } from './modules/attendance/attendance.routes';
import { biometricRouter } from './modules/biometric/biometric.routes';
import { reportsRouter } from './modules/reports/reports.routes';
import { dashboardRouter, searchRouter } from './modules/dashboard/dashboard.routes';

export function createApp(): Express {
  const app = express();

  // Railway terminates TLS at its edge; trust that hop so req.ip and the rate
  // limiter see the real client address rather than the proxy's.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      // The API serves JSON only; a restrictive CSP here costs nothing.
      contentSecurityPolicy: {
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
      hsts: isProduction ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    }),
  );

  app.use(
    cors((req, callback) => {
      const origin = req.headers.origin;

      const shared = {
        credentials: true,
        methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
        maxAge: 86_400,
      };

      // Server-to-server calls carry no Origin at all.
      if (!origin) {
        callback(null, { ...shared, origin: true });
        return;
      }

      // A browser sends Origin on every non-GET request, including one to
      // its own site. When the API is deployed behind the same domain as the
      // frontend — as it is on Netlify — those requests are same-origin and
      // must be allowed without appearing in the allowlist, or the API
      // rejects its own console the moment it tries to write anything.
      let sameOrigin = false;
      try {
        sameOrigin = new URL(origin).host === req.headers.host;
      } catch {
        // A malformed Origin is treated as cross-origin and falls through.
      }

      if (sameOrigin || env.CORS_ORIGINS.includes(origin)) {
        callback(null, { ...shared, origin });
        return;
      }

      // A rejected origin is the caller's fault, not a server fault: raising
      // a plain Error here surfaced as a 500 INTERNAL_ERROR.
      callback(forbidden('Origin not allowed by CORS policy.'));
    }),
  );

  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(requestContext);

  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as { requestId?: string }).requestId ?? '',
      autoLogging: {
        ignore: (req) => req.url === '/health' || req.url === '/health/ready',
      },
    }),
  );

  /* ---------------------------------------------------------------------
   * Health endpoints (PRD §44). Unauthenticated by design: Railway must be
   * able to poll them. They expose no business data.
   * ------------------------------------------------------------------ */

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.get('/health/ready', async (_req, res) => {
    const database = await checkConnection();
    res.status(database ? 200 : 503).json({
      status: database ? 'ok' : 'degraded',
      checks: { database: database ? 'ok' : 'unreachable' },
      uptimeSeconds: Math.round(process.uptime()),
    });
  });

  /* ---------------------------------------------------------------------
   * API v1. Everything below requireAuth is authenticated; each router adds
   * its own role and branch checks on top.
   * ------------------------------------------------------------------ */

  const v1 = express.Router();

  v1.use('/auth', authRouter);

  v1.use(requireAuth);
  v1.use(apiRateLimiter);

  v1.use('/branches', branchesRouter);
  v1.use('/users', usersRouter);
  v1.use('/students', studentsRouter);
  v1.use('/memberships', membershipsRouter);
  v1.use('/seats', seatsRouter);
  v1.use('/seat-allocations', seatAllocationsRouter);
  v1.use('/batches', batchesRouter);
  v1.use('/admissions', admissionsRouter);
  v1.use('/invoices', invoicesRouter);
  v1.use('/payments', paymentsRouter);
  v1.use('/fees', feesRouter);
  v1.use('/attendance', attendanceRouter);
  v1.use('/biometric', biometricRouter);
  v1.use('/reports', reportsRouter);
  v1.use('/dashboard', dashboardRouter);
  v1.use('/search', searchRouter);

  app.use('/api/v1', v1);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
