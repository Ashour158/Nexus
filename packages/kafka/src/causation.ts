import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * AU-5 cause-chain context.
 *
 * An automation rule that writes back to CRM makes CRM emit a domain event
 * (`deal.updated`, `activity.created`, …) which can re-trigger the same rule.
 * workflow-service bounds that cascade with a depth counter, but the counter is
 * only useful if it *survives the hop through CRM* — otherwise every CRM-emitted
 * event looks like a fresh depth-0 trigger and the guard never trips.
 *
 * Threading a `depth` argument through five entity services and their dozens of
 * `producer.publish` call sites would be invasive and easy to miss one. Instead
 * the internal automation routes establish this ambient context for the duration
 * of the request, and `NexusProducer.publish` stamps it onto every event emitted
 * inside that scope. Nothing outside an automation-driven request has a store, so
 * ordinary user writes emit exactly as before.
 */
export interface CausationContext {
  /** Hops since the root (user/system) event that started this chain. */
  depth: number;
  /** eventId of the event that began the chain, for tracing a runaway loop. */
  rootEventId?: string;
}

const causationStore = new AsyncLocalStorage<CausationContext>();

/** Run `fn` with a cause-chain context that publishes will inherit. */
export function runWithCausation<T>(context: CausationContext, fn: () => T): T {
  return causationStore.run(context, fn);
}

/** Ambient cause-chain context, or undefined outside an automation-driven request. */
export function getCausation(): CausationContext | undefined {
  return causationStore.getStore();
}

/**
 * Parse a cause chain off an inbound internal request. workflow-service sends it
 * both ways (headers survive proxies; the body field survives header stripping),
 * so accept either and prefer the header. Returns undefined when this is an
 * ordinary request, which leaves publishes unstamped.
 */
export function parseCausation(
  headers: Record<string, unknown>,
  body: unknown
): CausationContext | undefined {
  const headerDepth = Number(headers['x-causation-depth']);
  const bodyCausation =
    body && typeof body === 'object' && !Array.isArray(body)
      ? ((body as Record<string, unknown>)._causation as Record<string, unknown> | undefined)
      : undefined;
  const bodyDepth = Number(bodyCausation?.depth);

  const depth = Number.isFinite(headerDepth) ? headerDepth : Number.isFinite(bodyDepth) ? bodyDepth : NaN;
  if (!Number.isFinite(depth) || depth < 0) return undefined;

  const headerRoot = headers['x-root-event-id'];
  const rootEventId =
    typeof headerRoot === 'string' && headerRoot.length > 0
      ? headerRoot
      : typeof bodyCausation?.rootEventId === 'string'
        ? (bodyCausation.rootEventId as string)
        : undefined;

  return { depth: Math.floor(depth), ...(rootEventId ? { rootEventId } : {}) };
}
