/**
 * CommandCenter auto-enrollment consumer.
 *
 * Listens on the CRM domain topics and, for every ACTIVE CommandJourney whose
 * `entryTrigger` matches the event type + conditions, enrolls the record's
 * entity into that journey. Enrollment is idempotent on
 * (tenantId, journeyId, entityId) so replays / re-fires never double-enroll.
 *
 * Mirrors trigger.consumer.ts (event → matching definitions → act), reusing the
 * same rule-set condition semantics via journey-steps.evaluateRuleSet.
 */
import { NexusConsumer, TOPICS } from '@nexus/kafka';
import type { NexusProducer } from '@nexus/kafka';
import type { WorkflowPrisma } from '../prisma.js';
import { createCommandJourneysService } from '../services/command-journeys.service.js';
import { evaluateRuleSet } from '../engine/journey-steps.js';

type Logger = { warn: (obj: unknown, msg?: string) => void };

/**
 * Map a domain event type + payload to the CommandCenter entity it concerns.
 * Returns null when the event carries no identifiable entity id.
 */
function resolveEntity(
  eventType: string,
  payload: Record<string, unknown>
): { entityType: string; entityId: string } | null {
  const pick = (k: string): string | null => {
    const v = payload[k];
    return typeof v === 'string' && v.length > 0 ? v : null;
  };

  if (eventType.startsWith('lead.')) {
    const id = pick('leadId') ?? pick('id');
    return id ? { entityType: 'lead', entityId: id } : null;
  }
  if (eventType.startsWith('deal.')) {
    const id = pick('dealId') ?? pick('id');
    return id ? { entityType: 'deal', entityId: id } : null;
  }
  if (eventType.startsWith('contact.')) {
    const id = pick('contactId') ?? pick('id');
    return id ? { entityType: 'contact', entityId: id } : null;
  }
  if (eventType.startsWith('account.')) {
    const id = pick('accountId') ?? pick('id');
    return id ? { entityType: 'account', entityId: id } : null;
  }
  return null;
}

interface EntryTrigger {
  event?: string;
  conditions?: unknown[];
  match?: 'all' | 'any';
}

export async function startJourneyEnrollmentConsumer(
  prisma: WorkflowPrisma,
  producer: NexusProducer,
  logger: Logger
): Promise<NexusConsumer> {
  const consumer = new NexusConsumer('workflow-service.journey-enrollment');
  const journeys = createCommandJourneysService(prisma, producer);

  const onEvent = async (event: {
    type: string;
    tenantId: string;
    payload: Record<string, unknown>;
  }) => {
    try {
      const entity = resolveEntity(event.type, event.payload ?? {});
      if (!entity) return;

      // Candidate journeys: ACTIVE, same tenant + entityType.
      const active = await prisma.commandJourney.findMany({
        where: { tenantId: event.tenantId, status: 'ACTIVE', entityType: entity.entityType },
        select: { id: true, entryTrigger: true },
      });

      for (const j of active) {
        const trigger = (j.entryTrigger ?? {}) as EntryTrigger;
        // Journey opts into this event only if its entryTrigger.event matches
        // (an empty/absent event means "any event for this entityType").
        if (trigger.event && trigger.event !== event.type) continue;
        if (!evaluateRuleSet(trigger, event.payload ?? {})) continue;

        await journeys
          .enroll(event.tenantId, j.id, entity.entityType, entity.entityId, {
            ...event.payload,
            entityType: entity.entityType,
            entityId: entity.entityId,
          })
          .catch((err) => logger.warn({ err, journeyId: j.id }, 'Journey auto-enroll failed'));
      }
    } catch (err) {
      logger.warn({ err, type: event.type }, 'Journey enrollment handler failed');
    }
  };

  for (const t of [
    'lead.created',
    'deal.created',
    'deal.stage_changed',
    'deal.won',
    'deal.lost',
    'contact.created',
    'account.created',
  ]) {
    consumer.on(t, onEvent);
  }

  await consumer.subscribe([TOPICS.LEADS, TOPICS.DEALS, TOPICS.CONTACTS, TOPICS.ACCOUNTS]);
  await consumer.start();
  return consumer;
}
