'use client';

import type { ApiResponse, PaginationMeta } from '@manas/shared';
import { getSupabaseBrowserClient } from './supabase/client';

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Array<{ path: string; message: string }>,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }

  /** Field-level errors keyed by name, for inline form messages. */
  get fieldErrors(): Record<string, string> {
    const map: Record<string, string> = {};
    for (const detail of this.details ?? []) {
      // Paths arrive as "body.full_name"; the form only knows "full_name".
      const field = detail.path.split('.').slice(1).join('.') || detail.path;
      map[field] = detail.message;
    }
    return map;
  }
}

async function authHeader(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await getSupabaseBrowserClient().auth.getSession();

  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

export interface ClientResult<T> {
  data: T;
  meta?: PaginationMeta;
  message: string;
}

export async function request<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
    body?: unknown;
    query?: Record<string, unknown>;
  } = {},
): Promise<ClientResult<T>> {
  const url = new URL(`${API_URL}/api/v1${path.startsWith('/') ? path : `/${path}`}`);

  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url.toString(), {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeader()),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (response.status === 204) {
    return { data: null as T, message: 'Deleted successfully' };
  }

  let body: ApiResponse<T> & { meta?: PaginationMeta };

  try {
    body = await response.json();
  } catch {
    throw new ApiClientError(
      response.status,
      'INVALID_RESPONSE',
      'The server returned an unexpected response.',
    );
  }

  if (!response.ok || body.success === false) {
    const error = 'error' in body ? body.error : undefined;
    throw new ApiClientError(
      response.status,
      error?.code ?? 'INTERNAL_ERROR',
      error?.message ?? 'The request failed.',
      error?.details,
    );
  }

  return { data: body.data, meta: body.meta, message: body.message };
}

export const api = {
  get: <T>(path: string, query?: Record<string, unknown>) =>
    request<T>(path, { method: 'GET', query }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
