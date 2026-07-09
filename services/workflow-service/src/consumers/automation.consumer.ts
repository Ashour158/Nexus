import { NexusConsumer, TOPICS } from '@nexus/kafka';
import type { NexusProducer } from '@nexus/kafka';
import type { WorkflowPrisma } from '../prisma.js';
import {
  AUTOMATION_MODULES,
  createAutomationRulesService,
} from '../services/automation-rules.service.js';

/** Ticket-service publishes to its own topic (no TOPICS constant yet). */
const TICKET_TOPIC = 'nexus.ticket.events';

/** Derive the automation module from an event type ('deal.stage_changed' → 'deal'). */
function moduleForEvent(type: string): string {
  return type.split('.')[0] ?? type;
}

/**
 * Dedicated cross-module automation consumer. Independent of the workflow trigger
 * consumer (separate group id): for every relevant domain event it loads matching
 * active AutomationRules, evaluates their conditions, and executes their actions.
 *
 * Fail-open: a handler error is logged, never thrown, so it can neither block the
 * consumer loop nor other rules. Idempotency is enforced per (ruleId, eventId) in
 * the service layer.
 */
export async function startAutomationConsumer(
  prisma: WorkflowPrisma,
  producer?: NexusProducer
): Promise<NexusConsumer> {
  const consumer = new NexusConsumer('workflow-service.automation-rules');
  // Producer lets NOTIFY/EMAIL actions publish `notification.requested` so the
  // notification actually reaches delivery via notification-service.
  const rules = createAutomationRulesService(prisma, producer);

  const onEvent = async (event: {
    type: string;
    tenantId: string;
    eventId?: string;
    payload: Record<string, unknown>;
  }) => {
    if (!event.tenantId || !event.type) return;
    try {
      await rules.handleEvent({
        tenantId: event.tenantId,
        module: moduleForEvent(event.type),
        triggerEvent: event.type,
        eventId: event.eventId ?? `${event.type}:${JSON.stringify(event.payload).slice(0, 64)}`,
        payload: (event.payload ?? {}) as Record<string, unknown>,
      });
    } catch (err) {
      console.error(`[automation] handleEvent failed for ${event.type}:`, err);
    }
  };

  // Register a handler for every catalogued trigger event across all modules.
  const allEvents = new Set<string>(Object.values(AUTOMATION_MODULES).flat());
  for (const type of allEvents) {
    consumer.on(type, onEvent as never);
  }

  await consumer.subscribe([
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
    TOPICS.ANALYTICS, // campaign.* events
    TOPICS.WORKFLOWS,
    TICKET_TOPIC,
  ]);
  await consumer.start();
  return consumer;
}
