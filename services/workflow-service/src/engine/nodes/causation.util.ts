import type { ExecutionContext } from '../types.js';

/**
 * AU-5 loop guard — cause-chain propagation for internal CRM write actions.
 *
 * When an automation rule writes back to CRM (set-field / assign / create-activity),
 * CRM emits a domain event (deal.updated, activity.created, …) that can re-trigger
 * another rule. To bound that cascade we forward the *incremented* cause-chain
 * depth (and the root event id) on every internal call, both as headers and inside
 * the request body. CRM must copy these onto the domain event it emits so the
 * automation consumer sees the running depth and refuses to execute past the limit.
 *
 * See the crm-service propagation note in the AU-5 report: the internal-automation
 * routes must read `x-causation-depth` / `body._causation` and stamp
 * `causationDepth` + `rootEventId` onto the emitted event's top level.
 */
export function causationHeaders(context: ExecutionContext): Record<string, string> {
  const depth = (context.causationDepth ?? 0) + 1;
  return {
    'x-causation-depth': String(depth),
    ...(context.rootEventId ? { 'x-root-event-id': context.rootEventId } : {}),
  };
}

export function causationBody(context: ExecutionContext): { _causation: { depth: number; rootEventId?: string } } {
  return {
    _causation: {
      depth: (context.causationDepth ?? 0) + 1,
      ...(context.rootEventId ? { rootEventId: context.rootEventId } : {}),
    },
  };
}
