import type { NextFunction, Request, Response } from 'express';
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';
import type { AuthContext, UserRole, UserStatus } from '@manas/shared';
import { env } from '../config/env';
import { query } from '../database/pool';
import { unauthenticated } from '../utils/errors';
import { logger } from '../utils/logger';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
      requestId?: string;
    }
  }
}

/* --------------------------------------------------------------------------
 * Token verification
 *
 * Supabase signs access tokens either with the project's asymmetric signing
 * key (verified against the public JWKS endpoint) or, on older projects, with
 * a shared HS256 secret. Both are supported; JWKS is preferred because the
 * secret then never needs to exist on this server.
 * ----------------------------------------------------------------------- */

const ISSUER = `${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1`;

const remoteJwks: JWTVerifyGetKey | null = env.SUPABASE_JWT_SECRET
  ? null
  : createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks.json`));

const sharedSecret = env.SUPABASE_JWT_SECRET
  ? new TextEncoder().encode(env.SUPABASE_JWT_SECRET)
  : null;

async function verifyToken(token: string): Promise<JWTPayload> {
  const options = { issuer: ISSUER, audience: 'authenticated' };

  if (sharedSecret) {
    const { payload } = await jwtVerify(token, sharedSecret, options);
    return payload;
  }

  const { payload } = await jwtVerify(token, remoteJwks!, options);
  return payload;
}

/* --------------------------------------------------------------------------
 * Profile resolution
 *
 * Role and branch assignments live in the database, never in the JWT: a
 * revoked branch assignment must take effect immediately rather than when the
 * token happens to expire. A short cache keeps that cheap without making
 * revocation meaningfully slower.
 * ----------------------------------------------------------------------- */

interface ProfileRow {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  branch_ids: string[] | null;
}

const PROFILE_CACHE_TTL_MS = 15_000;
const profileCache = new Map<string, { context: AuthContext; expiresAt: number }>();

export function invalidateProfileCache(userId?: string): void {
  if (userId) profileCache.delete(userId);
  else profileCache.clear();
}

async function loadProfile(userId: string): Promise<AuthContext | null> {
  const cached = profileCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.context;

  const rows = await query<ProfileRow>(
    `SELECT u.id,
            u.email::text AS email,
            u.role,
            u.status,
            coalesce(
              array_agg(ub.branch_id) FILTER (WHERE ub.branch_id IS NOT NULL),
              '{}'
            ) AS branch_ids
       FROM public.users u
       LEFT JOIN public.user_branches ub ON ub.user_id = u.id
      WHERE u.id = $1
      GROUP BY u.id`,
    [userId],
  );

  const row = rows[0];
  if (!row) return null;

  const context: AuthContext = {
    userId: row.id,
    email: row.email,
    role: row.role,
    status: row.status,
    // Super Admins are branch-unbounded; `null` marks that explicitly so no
    // caller can mistake an empty list for "all branches".
    branchIds: row.role === 'SUPER_ADMIN' ? null : (row.branch_ids ?? []),
  };

  profileCache.set(userId, { context, expiresAt: Date.now() + PROFILE_CACHE_TTL_MS });
  return context;
}

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;

  const [scheme, token] = header.split(' ');
  if (!token || scheme?.toLowerCase() !== 'bearer') return null;

  return token.trim() || null;
}

/**
 * Rejects the request unless it carries a valid Supabase session belonging to
 * an ACTIVE application user.
 */
export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      next(unauthenticated('A bearer token is required.'));
      return;
    }

    let payload: JWTPayload;
    try {
      payload = await verifyToken(token);
    } catch (error) {
      logger.debug({ err: error }, 'Token verification failed');
      next(unauthenticated('The session token is invalid or has expired.'));
      return;
    }

    const userId = typeof payload.sub === 'string' ? payload.sub : null;
    if (!userId) {
      next(unauthenticated('The session token is missing a subject.'));
      return;
    }

    const profile = await loadProfile(userId);
    if (!profile) {
      // Authenticated with Supabase but no application profile: the account
      // exists in auth but has not been provisioned by a Super Admin.
      next(unauthenticated('This account has not been provisioned for the application.'));
      return;
    }

    if (profile.status !== 'ACTIVE') {
      next(unauthenticated('This account is not active. Contact your administrator.'));
      return;
    }

    req.auth = profile;
    next();
  } catch (error) {
    next(error);
  }
}

/** Narrowing helper — every handler behind requireAuth is guaranteed a context. */
export function getAuth(req: Request): AuthContext {
  if (!req.auth) {
    throw unauthenticated('Authentication context is missing.');
  }
  return req.auth;
}
