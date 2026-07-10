import { withResilience } from '@nexus/service-utils';
import type { ExecutionContext, NodeResult, WorkflowNode } from '../types.js';

/**
 * Non-2xx HTTP responses from an action target are surfaced as a thrown
 * `ActionHttpError` carrying the status code, so:
 *   - `withResilience` can decide retryability by status (5xx/429 → retry,
 *     4xx → fail fast — retrying a client error never succeeds), and
 *   - the run-status logic (executeRule / the graph executor) marks the run
 *     FAILED/PARTIAL instead of silently logging a 4xx/5xx as SUCCESS (RR-C2).
 */
export class ActionHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'ActionHttpError';
  }
}

export async function handleActionNode(
  node: WorkflowNode,
  context: ExecutionContext
): Promise<NodeResult> {
  const cfg = (node.config ?? {}) as {
    url?: string;
    method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
    body?: Record<string, unknown>;
    headers?: Record<string, string>;
  };
  if (!cfg.url) return { output: { skipped: true, reason: 'missing_url' } };

  // SSRF protection: block internal/private addresses and non-HTTP(S) protocols
  const parsedUrl = new URL(cfg.url);
  const blockedProtocols = ['file:', 'ftp:', 'gopher:', 'mailto:', 'data:', 'javascript:', 'vbscript:'];
  if (blockedProtocols.includes(parsedUrl.protocol)) {
    return { output: { skipped: true, reason: 'blocked_protocol' } };
  }
  const hostname = parsedUrl.hostname;
  const isPrivate =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.startsWith('10.') ||
    hostname.startsWith('172.16.') ||
    hostname.startsWith('172.17.') ||
    hostname.startsWith('172.18.') ||
    hostname.startsWith('172.19.') ||
    hostname.startsWith('172.20.') ||
    hostname.startsWith('172.21.') ||
    hostname.startsWith('172.22.') ||
    hostname.startsWith('172.23.') ||
    hostname.startsWith('172.24.') ||
    hostname.startsWith('172.25.') ||
    hostname.startsWith('172.26.') ||
    hostname.startsWith('172.27.') ||
    hostname.startsWith('172.28.') ||
    hostname.startsWith('172.29.') ||
    hostname.startsWith('172.30.') ||
    hostname.startsWith('172.31.') ||
    hostname.startsWith('192.168.') ||
    hostname.startsWith('169.254.');
  if (isPrivate) {
    return { output: { skipped: true, reason: 'private_url_blocked' } };
  }

  const method = cfg.method ?? 'POST';
  const body = cfg.body ?? context.triggerPayload;

  // Dry-run (AU-3): the full request is resolved above (URL, method, body, SSRF
  // checks) but we return the plan instead of issuing the fetch. Any secret in
  // the headers (e.g. x-service-token) is redacted so `/test` output is safe to
  // surface in the admin UI.
  if (context.simulate) {
    const safeHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(cfg.headers ?? {})) {
      safeHeaders[k] = /token|authorization|secret|key/i.test(k) ? '***redacted***' : v;
    }
    return {
      output: {
        simulated: true,
        request: {
          url: cfg.url,
          method,
          headers: safeHeaders,
          body: method === 'GET' ? undefined : body,
        },
      },
    };
  }

  // The fetch + response-status check live INSIDE the resilience callback so a
  // non-2xx response counts as a failed attempt: 5xx/429 is retried, and the
  // final failure propagates as a throw (never resolves as success — RR-C2).
  const result = await withResilience(
    async () => {
      const res = await fetch(cfg.url!, {
        method,
        headers: {
          'content-type': 'application/json',
          'x-tenant-id': context.tenantId,
          ...(cfg.headers ?? {}),
        },
        body: method === 'GET' ? undefined : JSON.stringify(body),
      });
      const text = await res.text();
      if (!res.ok) {
        throw new ActionHttpError(
          res.status,
          `Action ${method} ${parsedUrl.host}${parsedUrl.pathname} failed: ${res.status} ${text.slice(0, 500)}`
        );
      }
      return { status: res.status, body: text.slice(0, 5000) };
    },
    {
      timeoutMs: 10000,
      maxRetries: 3,
      // Retry transient failures (5xx/429/network/timeout); fail fast on 4xx —
      // a rejected/invalid request never succeeds on retry.
      retryable: (err: unknown) => {
        if (err instanceof ActionHttpError) return err.status >= 500 || err.status === 429;
        if (err instanceof Error) return /fetch|network|timeout|ECONNRESET|ETIMEDOUT|abort/i.test(err.message);
        return false;
      },
      circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 30000 },
      circuitBreakerName: `workflow-action:${parsedUrl.host}`,
    }
  );

  return { output: result };
}
