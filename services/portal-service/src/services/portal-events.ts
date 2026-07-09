import { TOPICS, type NexusProducer } from '@nexus/kafka';

/**
 * Portal engagement actions that are surfaced to the internal CRM timeline.
 * These mirror the `action` values written to `PortalAuditLog`.
 */
export type PortalEngagementAction = 'viewed' | 'accepted' | 'rejected' | 'downloaded';

const ACTION_VERB: Record<PortalEngagementAction, string> = {
  viewed: 'viewed',
  accepted: 'accepted',
  rejected: 'rejected',
  downloaded: 'downloaded',
};

/**
 * Fire-and-forget emitter that publishes a portal engagement event to the
 * internal activity stream (`TOPICS.ACTIVITIES`). This lets the internal CRM
 * timeline / notifications reflect what an external portal recipient did with a
 * shared quote / contract / invoice / account link.
 *
 * Fully fail-open: a missing/unconnected producer or a publish failure is
 * swallowed with a warning so portal endpoints never break because of Kafka.
 */
export async function emitPortalEngagement(
  producer: NexusProducer | null | undefined,
  input: {
    tenantId: string;
    entityType: string;
    entityId: string;
    action: PortalEngagementAction;
    token?: string;
    reason?: string;
  }
): Promise<void> {
  if (!producer) return;
  try {
    const verb = ACTION_VERB[input.action] ?? input.action;
    const subject = `Portal ${input.entityType.toLowerCase()} ${verb}`;
    await producer.publish(TOPICS.ACTIVITIES, {
      type: 'portal.engagement',
      tenantId: input.tenantId,
      payload: {
        source: 'portal',
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        subject,
        // Link the engagement back to the CRM record so the internal timeline
        // can attach it to the right account/quote/contract/invoice.
        ...(input.entityType === 'ACCOUNT'
          ? { accountId: input.entityId }
          : { relatedEntityType: input.entityType, relatedEntityId: input.entityId }),
        ...(input.reason ? { reason: input.reason } : {}),
        occurredAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[portal-service] emitPortalEngagement failed (ignored):', err);
  }
}
