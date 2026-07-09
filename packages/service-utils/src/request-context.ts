import rq from '@fastify/request-context';
import { AsyncLocalStorage } from 'node:async_hooks';

type Store = { get: (key: string) => unknown; set: (key: string, value: unknown) => void };

/**
 * The `@fastify/request-context` singleton (same object as `request.requestContext`).
 * Its `get`/`set` operate on a MODULE-PRIVATE `AsyncLocalStorage` that is only
 * populated inside a Fastify request (the plugin's `onRequest` hook calls
 * `als.run(...)`). Outside a request there is no store, so `set` is a no-op and
 * `get` returns `undefined` — which is why Kafka consumers (no request) need
 * their own ALS below.
 */
const fastifyCtx: Store = (rq as unknown as { requestContext: Store }).requestContext;

/**
 * Consumer-owned ALS for tenant context OUTSIDE a Fastify request (Kafka
 * consumers, workers, scheduled jobs). `@fastify/request-context` does not
 * expose a `.run()` on its private ALS, so `runWithTenant` establishes context
 * here instead. `alsStore` (below) reads this first, so a single `alsStore` is
 * the ONE tenant source of truth for `getTenantId()` in every service —
 * regardless of whether the caller is an HTTP request or a consumer.
 */
const consumerCtx = new AsyncLocalStorage<Record<string, unknown>>();

/**
 * Unified tenant/request context store. Every service reads tenant via
 * `alsStore.get('tenantId')`. It transparently resolves to whichever backing
 * store is active:
 *   - inside `runWithTenant(...)` (consumers/workers) → the consumer ALS, else
 *   - inside a Fastify request → `@fastify/request-context`.
 * This keeps existing call sites unchanged while making consumer paths seed-able.
 */
export const alsStore: Store = {
  get(key: string): unknown {
    const cs = consumerCtx.getStore();
    if (cs) return cs[key];
    return fastifyCtx.get(key);
  },
  set(key: string, value: unknown): void {
    const cs = consumerCtx.getStore();
    if (cs) {
      cs[key] = value;
      return;
    }
    fastifyCtx.set(key, value);
  },
};

/**
 * Run `fn` with `tenantId` seeded into the SAME store `alsStore.get('tenantId')`
 * reads, so any awaited Prisma model op inside `fn` sees the tenant and the
 * fail-closed tenant extension (RR-H2) does not throw. Use this to wrap Kafka
 * consumer handlers and any other non-request code path that touches
 * tenant-scoped Prisma.
 *
 * Reasoning that `getTenantId()` returns `tenantId` inside `fn`: this calls
 * `consumerCtx.run({ tenantId }, fn)`, so within `fn` (and all its awaited
 * continuations) `consumerCtx.getStore()` is `{ tenantId }`; `alsStore.get`
 * checks the consumer store first and returns it. AsyncLocalStorage propagates
 * across `await`, so ops deep inside `fn` still see it.
 */
export function runWithTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  return consumerCtx.run({ tenantId }, fn);
}

/** Convenience reader: current tenantId from `alsStore` (or undefined). */
export function getTenantId(): string | undefined {
  const v = alsStore.get('tenantId');
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}
