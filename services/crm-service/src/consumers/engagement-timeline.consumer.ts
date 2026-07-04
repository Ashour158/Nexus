import { NexusConsumer, TOPICS } from '@nexus/kafka';
import type { CrmPrisma } from '../prisma.js';

/**
 * Unified customer-journey timeline projector (additive, idempotent, fail-open).
 *
 * The finance-timeline consumer only projects finance/quote events into the
 * shared {@link CrmPrisma.activity} store. This consumer complements it by
 * projecting the *other* external engagement sources so the account / contact
 * journey is complete:
 *   - email events   (TOPICS.EMAILS: email.sent / email.received / email.replied)
 *   - portal events  (TOPICS.ACTIVITIES: portal.engagement)
 *
 * Internal `activity.created` / `activity.completed` events are intentionally
 * NOT projected — those describe rows that already live in the Activity table
 * (surfaced directly by getAccountTimeline / getContactTimeline), so projecting
 * them would double-count. Only sources that do not already have an Activity
 * row are projected here.
 *
 * The projected rows are tagged `customFields.timelineSource = 'email' | 'portal'`
 * and de-duplicated on `customFields.sourceEventId`, mirroring the finance
 * projector so getAccountTimeline / getContactTimeline surface them for free.
 */

const EMAIL_TIMELINE_EVENTS = ['email.sent', 'email.received', 'email.replied'] as const;
const PORTAL_TIMELINE_EVENTS = ['portal.engagement'] as const;

type TimelineSource = 'email' | 'portal';

type EngagementEvent = {
  id?: string;
  type?: string;
  tenantId?: string;
  occurredAt?: string;
  payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

type ProjectionResult =
  | { status: 'projected'; activityId: string; sourceEventId: string }
  | { status: 'duplicate'; sourceEventId: string }
  | { status: 'ignored'; reason: string };

function stringField(source: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = source?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function eventPayload(event: EngagementEvent): Record<string, unknown> {
  return event.payload && typeof event.payload === 'object' ? event.payload : {};
}

function eventMetadata(event: EngagementEvent): Record<string, unknown> {
  const payload = eventPayload(event);
  const nested = payload.metadata;
  return {
    ...(event.metadata && typeof event.metadata === 'object' ? event.metadata : {}),
    ...(nested && typeof nested === 'object' ? (nested as Record<string, unknown>) : {}),
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: unknown }).code === 'P2002'
  );
}

function timelineSourceFor(type: string): TimelineSource | null {
  if ((EMAIL_TIMELINE_EVENTS as readonly string[]).includes(type)) return 'email';
  if ((PORTAL_TIMELINE_EVENTS as readonly string[]).includes(type)) return 'portal';
  return null;
}

/**
 * Derive a stable source-event id for idempotency. Prefers an explicit event id,
 * then metadata.sourceEventId, then a deterministic composite of the natural key
 * (messageId / entityId + action) so retries de-dupe even without an event id.
 */
function sourceEventId(event: EngagementEvent, type: string, payload: Record<string, unknown>, metadata: Record<string, unknown>): string | undefined {
  const explicit =
    stringField(metadata, 'sourceEventId') ??
    event.id ??
    stringField(payload, 'eventId') ??
    stringField(payload, 'messageId');
  if (explicit) return explicit;

  // Portal engagement has no natural event id — build one from its natural key.
  if (type === 'portal.engagement') {
    const entityId = stringField(payload, 'entityId');
    const action = stringField(payload, 'action');
    const occurredAt = stringField(payload, 'occurredAt') ?? event.occurredAt;
    if (entityId && action) {
      return `portal:${entityId}:${action}:${occurredAt ?? ''}`;
    }
  }
  return undefined;
}

function titleForEvent(type: string, payload: Record<string, unknown>): string {
  switch (type) {
    case 'email.sent':
      return `Email sent${stringField(payload, 'subject') ? `: ${stringField(payload, 'subject')}` : ''}`;
    case 'email.received':
      return `Email received${stringField(payload, 'subject') ? `: ${stringField(payload, 'subject')}` : ''}`;
    case 'email.replied':
      return 'Email replied';
    case 'portal.engagement':
      return stringField(payload, 'subject') ?? 'Portal engagement';
    default:
      return type.replaceAll('.', ' ');
  }
}

function descriptionForEvent(type: string, payload: Record<string, unknown>): string | null {
  if (type.startsWith('email.')) {
    const from = stringField(payload, 'from');
    const to = stringField(payload, 'to');
    const direction = stringField(payload, 'direction');
    return [
      direction ? `Direction: ${direction}` : undefined,
      from ? `From: ${from}` : undefined,
      to ? `To: ${to}` : undefined,
    ]
      .filter(Boolean)
      .join(' | ') || null;
  }
  if (type === 'portal.engagement') {
    const action = stringField(payload, 'action');
    const entityType = stringField(payload, 'entityType');
    const reason = stringField(payload, 'reason');
    return [
      action ? `Action: ${action}` : undefined,
      entityType ? `Entity: ${entityType}` : undefined,
      reason ? `Reason: ${reason}` : undefined,
    ]
      .filter(Boolean)
      .join(' | ') || null;
  }
  return null;
}

/**
 * Project a single engagement event into the Activity timeline store.
 * Idempotent (de-dupes on customFields.sourceEventId) and fail-open at the
 * caller. Ignored when it cannot be anchored to a CRM record.
 */
export async function projectEngagementTimelineEvent(
  prisma: Pick<CrmPrisma, 'activity'>,
  event: EngagementEvent
): Promise<ProjectionResult> {
  const type = event.type;
  if (!type) return { status: 'ignored', reason: 'missing_type' };
  const timelineSource = timelineSourceFor(type);
  if (!timelineSource) return { status: 'ignored', reason: 'unsupported_event' };

  const payload = eventPayload(event);
  const metadata = eventMetadata(event);
  const tenantId = event.tenantId ?? stringField(payload, 'tenantId') ?? stringField(metadata, 'tenantId');
  if (!tenantId) return { status: 'ignored', reason: 'missing_tenant' };

  // Anchor to a CRM record. Portal engagement on an ACCOUNT link carries
  // accountId directly; other portal links carry relatedEntityId only, which we
  // cannot anchor, so they are ignored (fail-open, no noise).
  const accountId = stringField(payload, 'accountId');
  const contactId = stringField(payload, 'contactId');
  const dealId = stringField(payload, 'dealId') ?? stringField(payload, 'opportunityId');
  if (!accountId && !contactId && !dealId) {
    return { status: 'ignored', reason: 'missing_crm_anchor' };
  }

  const sourceId = sourceEventId(event, type, payload, metadata);
  if (!sourceId) return { status: 'ignored', reason: 'missing_source_event_id' };

  const existing = await prisma.activity.findFirst({
    where: {
      tenantId,
      customFields: {
        path: ['sourceEventId'],
        equals: sourceId,
      },
    },
    select: { id: true },
  } as never);
  if (existing) return { status: 'duplicate', sourceEventId: sourceId };

  const actorId =
    stringField(payload, 'actorId') ?? stringField(metadata, 'actorId') ?? stringField(payload, 'source') ?? 'system';
  const occurredAt = stringField(payload, 'occurredAt') ?? event.occurredAt ?? new Date().toISOString();
  const activityType = timelineSource === 'email' ? 'EMAIL' : 'NOTE';

  try {
    const activity = (await prisma.activity.create({
      data: {
        tenantId,
        ownerId: actorId,
        accountId,
        contactId,
        dealId,
        type: activityType,
        subject: titleForEvent(type, payload),
        description: descriptionForEvent(type, payload),
        status: 'COMPLETED',
        priority: 'NORMAL',
        createdAt: new Date(occurredAt),
        updatedAt: new Date(),
        customFields: {
          timelineSource,
          sourceEventId: sourceId,
          sourceEventType: type,
          projectionVersion: 1,
          projectionIdempotencyVersion: 1,
          correlationId: stringField(metadata, 'correlationId') ?? stringField(payload, 'correlationId'),
          // Email-specific
          messageId: stringField(payload, 'messageId'),
          threadId: stringField(payload, 'threadId'),
          direction: stringField(payload, 'direction'),
          // Portal-specific
          portalAction: stringField(payload, 'action'),
          portalEntityType: stringField(payload, 'entityType'),
          portalEntityId: stringField(payload, 'entityId'),
        },
      },
      select: { id: true },
    } as never)) as { id: string };

    return { status: 'projected', activityId: activity.id, sourceEventId: sourceId };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { status: 'duplicate', sourceEventId: sourceId };
    }
    throw error;
  }
}

/**
 * Starts the engagement-timeline consumer. Subscribes to the emails topic and
 * (for portal.engagement) the activities topic. Handlers are individually
 * fail-open so one bad event never stalls the stream.
 */
export async function startEngagementTimelineConsumer(prisma: CrmPrisma): Promise<NexusConsumer> {
  const consumer = new NexusConsumer('crm-service.engagement-timeline');
  await consumer.subscribe([TOPICS.EMAILS, TOPICS.ACTIVITIES]);

  const handle = async (event: unknown): Promise<void> => {
    try {
      await projectEngagementTimelineEvent(prisma, event as EngagementEvent);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[engagement-timeline] projection failed (ignored)', err);
    }
  };

  for (const eventType of [...EMAIL_TIMELINE_EVENTS, ...PORTAL_TIMELINE_EVENTS]) {
    consumer.on(eventType, handle);
  }

  await consumer.start();
  return consumer;
}
