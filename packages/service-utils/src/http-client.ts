/**
 * NexusHttpClient — resilient HTTP client with automatic retry, circuit breaker,
 * timeout, and distributed tracing header propagation.
 */

import { withResilience, type ResilienceOptions } from './resilience.js';
import { NexusError } from './errors.js';
import { requestContext } from '@fastify/request-context';

export interface HttpClientOptions extends ResilienceOptions {
  baseURL?: string;
  headers?: Record<string, string>;
  /** Custom fetch implementation (for testing or special environments) */
  fetchFn?: typeof fetch;
}

export class NexusHttpClient {
  private baseURL: string;
  private defaultHeaders: Record<string, string>;
  private resilience: ResilienceOptions;
  private fetchFn: typeof fetch;

  constructor(opts: HttpClientOptions = {}) {
    this.baseURL = opts.baseURL?.replace(/\/$/, '') ?? '';
    this.defaultHeaders = opts.headers ?? {};
    this.resilience = opts;
    // Default timeout of 10s to prevent hung connections under load
    if (!this.resilience.timeoutMs) {
      this.resilience.timeoutMs = 10_000;
    }
    this.fetchFn = opts.fetchFn ?? globalThis.fetch;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>
  ): Promise<T> {
    const url = path.startsWith('http') ? path : `${this.baseURL}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.defaultHeaders,
      ...extraHeaders,
    };

    // Propagate trace context if available from Fastify request context
    try {
      const traceparent = (requestContext as any).get('traceparent') as string | undefined;
      if (traceparent) headers.traceparent = traceparent;
    } catch {
      // Not in a Fastify request context — ignore
    }

    const fetchCall = async (): Promise<T> => {
      const res = await this.fetchFn(url, {
        method,
        headers,
        body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => 'Unknown error');
        throw new NexusError(
          `HTTP_${res.status}`,
          `HTTP ${res.status}: ${text}`,
          res.status
        );
      }

      const contentType = res.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        return (await res.json()) as T;
      }
      return (await res.text()) as unknown as T;
    };

    return withResilience(fetchCall, this.resilience);
  }

  get<T>(path: string, headers?: Record<string, string>): Promise<T> {
    return this.request<T>('GET', path, undefined, headers);
  }

  post<T>(path: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
    return this.request<T>('POST', path, body, headers);
  }

  put<T>(path: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
    return this.request<T>('PUT', path, body, headers);
  }

  patch<T>(path: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
    return this.request<T>('PATCH', path, body, headers);
  }

  delete<T>(path: string, headers?: Record<string, string>): Promise<T> {
    return this.request<T>('DELETE', path, undefined, headers);
  }
}

/** Convenience factory for external API integrations. */
export function createHttpClient(opts: HttpClientOptions = {}): NexusHttpClient {
  return new NexusHttpClient(opts);
}
