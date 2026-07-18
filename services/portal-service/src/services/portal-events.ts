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

/**
 * Domain event emitted when an external portal user submits a self-service
 * case/ticket. Published to `TOPICS.ACTIVITIES` (type `portal.case.submitted`)
 * so the internal CRM timeline reflects it and any consumer (ticket/automation)
 * can react. Fully fail-open — a broker outage must never break case submission.
 */
export async function emitPortalCaseSubmitted(
  producer: NexusProducer | null | undefined,
  input: {
    tenantId: string;
    caseId: string;
    accountId: string;
    contactId?: string | null;
    portalUserId: string;
    subject: string;
    priority: string;
    externalTicketId?: string | null;
  }
): Promise<void> {
  if (!producer) return;
  try {
    await producer.publish(TOPICS.ACTIVITIES, {
      type: 'portal.case.submitted',
      tenantId: input.tenantId,
      payload: {
        source: 'portal',
        action: 'case.submitted',
        subject: `Portal case submitted: ${input.subject}`,
        caseId: input.caseId,
        accountId: input.accountId,
        contactId: input.contactId ?? null,
        portalUserId: input.portalUserId,
        priority: input.priority,
        externalTicketId: input.externalTicketId ?? null,
        relatedEntityType: 'CASE',
        relatedEntityId: input.caseId,
        occurredAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[portal-service] emitPortalCaseSubmitted failed (ignored):', err);
  }
}

/**
 * Domain event emitted when an external portal user replies on their own case.
 * Published to `TOPICS.ACTIVITIES` (type `portal.case.commented`). Fail-open.
 */
export async function emitPortalCaseComment(
  producer: NexusProducer | null | undefined,
  input: { tenantId: string; caseId: string; portalUserId: string; commentId: string }
): Promise<void> {
  if (!producer) return;
  try {
    await producer.publish(TOPICS.ACTIVITIES, {
      type: 'portal.case.commented',
      tenantId: input.tenantId,
      payload: {
        source: 'portal',
        action: 'case.commented',
        subject: 'Portal case reply',
        caseId: input.caseId,
        commentId: input.commentId,
        portalUserId: input.portalUserId,
        relatedEntityType: 'CASE',
        relatedEntityId: input.caseId,
        occurredAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[portal-service] emitPortalCaseComment failed (ignored):', err);
  }
}

/**
 * Domain event emitted when a `partner` portal user registers a deal. Published
 * to `TOPICS.LEADS` (type `portal.deal.registered`) so the CRM/lead service can
 * materialize it as a lead/deal referral (deal-registration style). Fail-open.
 */
export async function emitPartnerDealRegistered(
  producer: NexusProducer | null | undefined,
  input: {
    tenantId: string;
    registrationId: string;
    accountId: string;
    portalUserId: string;
    dealName: string;
    customerName: string;
    estimatedValue?: number | null;
    currency?: string | null;
  }
): Promise<void> {
  if (!producer) return;
  try {
    await producer.publish(TOPICS.LEADS, {
      type: 'portal.deal.registered',
      tenantId: input.tenantId,
      payload: {
        source: 'portal.partner',
        action: 'deal.registered',
        subject: `Partner deal registration: ${input.dealName}`,
        registrationId: input.registrationId,
        accountId: input.accountId,
        partnerPortalUserId: input.portalUserId,
        dealName: input.dealName,
        customerName: input.customerName,
        estimatedValue: input.estimatedValue ?? null,
        currency: input.currency ?? null,
        occurredAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[portal-service] emitPartnerDealRegistered failed (ignored):', err);
  }
}
