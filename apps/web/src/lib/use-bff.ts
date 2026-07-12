'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '@/stores/auth.store';

/**
 * Same-origin BFF client for Setup pages.
 *
 * The browser calls `/bff/<domain>/*`, which Next rewrites to the internal
 * service (see next.config.mjs). `/bff/*` is a PUBLIC middleware path, so the
 * server-side token-attach used for `/api/*` does NOT run here — every call
 * must carry the Bearer token from the in-memory auth store (mirrors
 * SetupResourceList's fetch convention).
 *
 * Every method resolves (never throws) so pages can render a graceful
 * empty/error state when a backend is unreachable (404 / network).
 */

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface BffResult<T = unknown> {
  ok: boolean;
  status: number;
  /** Normalized payload: unwraps `{ data }` and `{ data: { data } }`. */
  data: T | null;
  /** Raw parsed JSON envelope (for endpoints with a non-standard shape). */
  raw: unknown;
  error?: string;
}

function unwrap(json: unknown): unknown {
  if (json && typeof json === 'object' && 'data' in json) {
    const inner = (json as { data: unknown }).data;
    if (inner && typeof inner === 'object' && 'data' in (inner as object)) {
      return (inner as { data: unknown }).data;
    }
    return inner;
  }
  return json;
}

function messageFrom(json: unknown, status: number): string {
  if (json && typeof json === 'object') {
    const err = (json as { error?: unknown }).error;
    if (typeof err === 'string') return err;
    if (err && typeof err === 'object' && 'message' in err) {
      return String((err as { message: unknown }).message);
    }
  }
  return `Request failed (${status})`;
}

export function useBff() {
  const token = useAuthStore((s) => s.accessToken);

  const request = useCallback(
    async <T = unknown>(method: HttpMethod, path: string, body?: unknown): Promise<BffResult<T>> => {
      try {
        const res = await fetch(path, {
          method,
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        let json: unknown = null;
        try {
          json = await res.json();
        } catch {
          json = null;
        }
        return {
          ok: res.ok,
          status: res.status,
          data: res.ok ? (unwrap(json) as T) : null,
          raw: json,
          error: res.ok ? undefined : messageFrom(json, res.status),
        };
      } catch (err) {
        return {
          ok: false,
          status: 0,
          data: null,
          raw: null,
          error: err instanceof Error ? err.message : 'Network error',
        };
      }
    },
    [token]
  );

  // Memoize on `request` (stable per token) so consumer effects that depend on
  // these methods don't re-run every render.
  return useMemo(
    () => ({
      request,
      get: <T = unknown>(path: string) => request<T>('GET', path),
      post: <T = unknown>(path: string, body?: unknown) => request<T>('POST', path, body),
      patch: <T = unknown>(path: string, body?: unknown) => request<T>('PATCH', path, body),
      put: <T = unknown>(path: string, body?: unknown) => request<T>('PUT', path, body),
      del: <T = unknown>(path: string, body?: unknown) => request<T>('DELETE', path, body),
    }),
    [request]
  );
}

export type ListState = 'loading' | 'ready' | 'error';

/**
 * Load an array from a `{ success, data }` (or paginated `{ data: { data } }`)
 * BFF endpoint. Degrades to an empty list on 404 / unreachable backend, and to
 * `error` only on a genuine network failure — never throws.
 */
export function useBffList<T = Record<string, unknown>>(endpoint: string | null) {
  const { get } = useBff();
  const [rows, setRows] = useState<T[]>([]);
  const [state, setState] = useState<ListState>('loading');

  const reload = useCallback(async () => {
    if (!endpoint) {
      setRows([]);
      setState('ready');
      return;
    }
    setState('loading');
    const res = await get<T[]>(endpoint);
    if (res.status === 0) {
      setRows([]);
      setState('error');
      return;
    }
    setRows(Array.isArray(res.data) ? res.data : []);
    setState('ready');
  }, [endpoint, get]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { rows, state, reload, setRows };
}
