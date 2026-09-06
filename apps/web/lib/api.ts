import type { ApiResponse, PaginationMeta } from '@manas/shared';
import { getAccessToken } from './supabase/server';
import { IS_DEMO_MODE } from './demo/config';
import { resolveDemoRequest } from './demo/resolver';

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Array<{ path: string; message: string }>,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export interface ApiResult<T> {
  data: T;
  meta?: PaginationMeta;
  message: string;
}

/**
 * Server-side API client.
 *
 * Forwards the caller's Supabase access token so the Node API resolves the
 * real user — the frontend never asserts a role or branch of its own.
 */
export async function apiFetch<T>(
  path: string,
  init: RequestInit & { query?: Record<string, unknown> } = {},
): Promise<ApiResult<T>> {
  // Demo mode serves every read from fixtures so the UI can be reviewed
  // before a backend exists. Unreachable in a production build.
  if (IS_DEMO_MODE) {
    const resolved = resolveDemoRequest(path, init.query ?? {});

    if (!resolved) {
      throw new ApiRequestError(
        404,
        'NOT_FOUND',
        `No demo fixture is defined for ${path}.`,
      );
    }

    return { data: resolved.data as T, meta: resolved.meta, message: resolved.message };
  }

  const token = await getAccessToken();
  const url = new URL(`${API_URL}/api/v1${path.startsWith('/') ? path : `/${path}`}`);

  for (const [key, value] of Object.entries(init.query ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url.toString(), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
    // Admin data is per-user and per-branch; caching it across requests would
    // be a data leak, not an optimisation.
    cache: 'no-store',
  });

  if (response.status === 204) {
    return { data: null as T, message: 'Deleted successfully' };
  }

  let body: ApiResponse<T> & { meta?: PaginationMeta };

  try {
    body = await response.json();
  } catch {
    throw new ApiRequestError(
      response.status,
      'INVALID_RESPONSE',
      'The server returned an unexpected response.',
    );
  }

  if (!response.ok || body.success === false) {
    const error = 'error' in body ? body.error : undefined;
    throw new ApiRequestError(
      response.status,
      error?.code ?? 'INTERNAL_ERROR',
      error?.message ?? 'The request failed.',
      error?.details,
    );
  }

  return { data: body.data, meta: body.meta, message: body.message };
}

/**
 * Convenience wrapper for pages that would rather render an empty state than
 * an error boundary when a list cannot be loaded.
 */
export async function apiFetchSafe<T>(
  path: string,
  init: RequestInit & { query?: Record<string, unknown> } = {},
  fallback: T,
): Promise<ApiResult<T> & { error: string | null }> {
  try {
    const result = await apiFetch<T>(path, init);
    return { ...result, error: null };
  } catch (error) {
    return {
      data: fallback,
      message: '',
      error:
        error instanceof ApiRequestError
          ? error.message
          : 'Could not reach the server. Check that the API is running.',
    };
  }
}
