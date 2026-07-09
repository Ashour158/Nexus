import { withResilience } from '@nexus/service-utils';
import type { ExecutionContext, NodeResult, WorkflowNode } from '../types.js';

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

  const res = await withResilience(
    () =>
      fetch(cfg.url!, {
        method,
        headers: {
          'content-type': 'application/json',
          'x-tenant-id': context.tenantId,
          ...(cfg.headers ?? {}),
        },
        body: method === 'GET' ? undefined : JSON.stringify(body),
      }),
    {
      timeoutMs: 10000,
      maxRetries: 3,
      circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 30000 },
    }
  );

  const text = await res.text();
  return { output: { status: res.status, body: text.slice(0, 5000) } };
}
