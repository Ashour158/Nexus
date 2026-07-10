import { NexusConsumer, TOPICS } from '@nexus/kafka';
import type { NexusProducer } from '@nexus/kafka';
import type { WorkflowPrisma } from '../prisma.js';
import {
  AUTOMATION_MODULES,
  createAutomationRulesService,
} from '../services/automation-rules.service.js';

/** Ticket-service publishes to its own topic (no TOPICS constant yet). */
export const TICKET_TOPIC = 'nexus.ticket.events';

/** The automation domain topics this consumer (and its DLQ replay) tracks. */
export const AUTOMATION_TOPICS: string[] = [
  TOPICS.LEADS,
  TOPICS.CONTACTS,
  TOPICS.ACCOUNTS,
  TOPICS.DEALS,
  TOPICS.ACTIVITIES,
  TOPICS.QUOTES,
  TOPICS.INVOICES,
  TOPICS.PAYMENTS,
  TOPICS.CONTRACTS,
  TOPICS.COMMISSIONS,
  TOPICS.NOTIFICATIONS,
  TOPICS.ANALYTICS,
  TOPICS.WORKFLOWS,
  TICKET_TOPIC,
];

/** Derive the automation module from an event type ('deal.stage_changed' → 'deal'). */
export function moduleForEvent(type: string): string {
  return type.split('.')[0] ?? type;
}

/** Read the cause-chain depth from a domain event (top-level, payload, or header). */
export function readCausationDepth(event: Record<string, unknown>, headers?: Record<string, unknown>): number {
  const candidates = [
    event.causationDepth,
    (event.payload as Record<string, unknown> | undefined)?.causationDepth,
    headers?.['x-causation-depth'],
  ];
  for (const c of candidates) {
    const n = typeof c === 'string' ? Number(c) : typeof c === 'number' ? c : NaN;
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  }
  return 0;
}

export function readRootEventId(event: Record<string, unknown>, headers?: Record<string, unknown>): string | undefined {
  const v =
    event.rootEventId ??
    (event.payload as Record<string, unknown> | undefined)?.rootEventId ??
    headers?.['x-root-event-id'];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

/**
 * Dedicated cross-module automation consumer. Independent of the workflow trigger
 * consumer (separate group id): for every relevant domain event it loads matching
 * active AutomationRules, evaluates their conditions, and executes their actions.
 *
 * Error handling (AU-4): `handleEvent` throws on *transient* processing failures.
 * That throw is intentionally NOT swallowed here — it propagates to the
 * NexusConsumer, which retries (`maxRetries`) and then routes the original event
 * to `<topic>.dlq` (`dlqEnabled`) for replay. "No rule matched" and permanent
 * (4xx/config) failures do not throw and are simply dropped/recorded. Per-rule
 * fail-open and (ruleId,eventId) idempotency are enforced in the service layer.
 */
export async function startAutomationConsumer(
  prisma: WorkflowPrisma,
  producer?: NexusProducer
): Promise<NexusConsumer> {
  const consumer = new NexusConsumer({
    groupId: 'workflow-service.automation-rules',
    // Persistent (post-retry) transient failures land in `<topic>.dlq`.
    dlqEnabled: true,
    maxRetries: Number(process.env.AUTOMATION_MAX_RETRIES ?? 3),
  });
  // Producer lets NOTIFY/EMAIL actions publish `notification.requested` so the
  // notification actually reaches delivery via notification-service.
  const rules = createAutomationRulesService(prisma, producer);
  const onEvent = makeAutomationHandler(rules);

  // Register a handler for every catalogued trigger event across all modules.
  const allEvents = new Set<string>(Object.values(AUTOMATION_MODULES).flat());
  for (const type of allEvents) {
    consumer.on(type, onEvent as never);
  }

  await consumer.subscribe(AUTOMATION_TOPICS);
  await consumer.start();
  return consumer;
}

/**
 * Build the per-event handler that drives `handleEvent`. Shared by the live
 * consumer and the DLQ replay consumer so replay follows exactly the same path
 * (including the retry-of-FAILED idempotency + loop guard).
 */
export function makeAutomationHandler(
  rules: ReturnType<typeof createAutomationRulesService>
) {
  return async (
    event: {
      type: string;
      tenantId: string;
      eventId?: string;
      payload: Record<string, unknown>;
      [key: string]: unknown;
    },
    rawMessage?: { headers?: Record<string, unknown> }
  ): Promise<void> => {
    if (!event.tenantId || !event.type) return;
    const headers = rawMessage?.headers;
    // Throwing propagates to NexusConsumer → retry + DLQ (AU-4). Do not catch here.
    await rules.handleEvent({
      tenantId: event.tenantId,
      module: moduleForEvent(event.type),
      triggerEvent: event.type,
      eventId: event.eventId ?? `${event.type}:${JSON.stringify(event.payload).slice(0, 64)}`,
      payload: (event.payload ?? {}) as Record<string, unknown>,
      causationDepth: readCausationDepth(event, headers),
      rootEventId: readRootEventId(event, headers),
    });
  };
}
