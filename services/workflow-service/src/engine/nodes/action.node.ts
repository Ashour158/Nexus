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

  const method = cfg.method ?? 'POST';
  const body = cfg.body ?? context.triggerPayload;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(cfg.url, {
      method,
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': context.tenantId,
        ...(cfg.headers ?? {}),
      },
      body: method === 'GET' ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    return { output: { status: res.status, body: text.slice(0, 5000) } };
  } finally {
    clearTimeout(timer);
  }
}
