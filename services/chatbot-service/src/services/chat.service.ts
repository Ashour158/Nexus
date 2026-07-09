import type { NexusProducer } from '@nexus/kafka';
import { TOPICS } from '@nexus/kafka';
import type { Conversation } from '../../../../node_modules/.prisma/chatbot-client/index.js';

/**
 * Web live-chat helpers — contact/lead linkage + CRM timeline events.
 *
 * Everything here is additive and fail-open: a failure to resolve a contact or
 * publish a timeline event must never break the visitor's chat session. The web
 * channel reuses the shared Conversation/Message schema and the rules-only
 * `processMessage` engine; this module only adds the CRM plumbing that the
 * messaging channels don't need (visitor→contact resolution, lead capture, and
 * timeline emission keyed by contactId/leadId).
 */

function internalHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${process.env.INTERNAL_SERVICE_TOKEN ?? ''}`,
  };
}

/** Basic email shape check — deterministic, no external calls. */
export function looksLikeEmail(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/**
 * Resolve a visitor email to an existing CRM contact id.
 * Guarded HTTP to crm-service; returns null on any failure or no match.
 */
export async function resolveContactByEmail(
  _tenantId: string,
  email: string
): Promise<string | null> {
  const base = process.env.CRM_SERVICE_URL;
  if (!base || !looksLikeEmail(email)) return null;
  try {
    const res = await fetch(
      `${base}/api/v1/contacts?search=${encodeURIComponent(email.trim())}&limit=1`,
      { headers: internalHeaders() }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: Array<{ id?: string }> };
    return data?.data?.[0]?.id ?? null;
  } catch (err) {
    console.warn('resolveContactByEmail: crm-service lookup failed (continuing):', err);
    return null;
  }
}

/**
 * Emit a `lead.captured` event so the CRM can create a lead from an anonymous
 * web visitor who shared contact details but isn't a known contact. Fail-open.
 */
export async function emitLeadCaptured(
  producer: NexusProducer | null | undefined,
  input: {
    conversation: Pick<Conversation, 'id' | 'tenantId' | 'channel'>;
    name?: string | null;
    email?: string | null;
  }
): Promise<void> {
  if (!producer) return;
  try {
    await producer.publish(TOPICS.LEADS, {
      type: 'lead.captured',
      tenantId: input.conversation.tenantId,
      payload: {
        source: 'WEB_CHAT',
        firstName: input.name ?? undefined,
        email: input.email ?? undefined,
        conversationId: input.conversation.id,
        channel: input.conversation.channel,
      },
    });
  } catch (err) {
    console.warn('emitLeadCaptured: failed to publish lead event (continuing):', err);
  }
}

export type ChatTimelineType = 'chat.session_started' | 'chat.message' | 'chat.handed_off';

/**
 * Emit a chat activity onto the CRM timeline (TOPICS.ACTIVITIES), carrying
 * contactId/leadId so the conversation lands on the right record. Fail-open.
 */
export async function emitChatTimeline(
  producer: NexusProducer | null | undefined,
  input: {
    type: ChatTimelineType;
    conversation: Pick<
      Conversation,
      'id' | 'tenantId' | 'channel' | 'contactId' | 'leadId'
    >;
    body?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  if (!producer) return;
  try {
    await producer.publish(TOPICS.ACTIVITIES, {
      type: input.type,
      tenantId: input.conversation.tenantId,
      payload: {
        activityType: 'CHAT',
        channel: input.conversation.channel,
        conversationId: input.conversation.id,
        contactId: input.conversation.contactId ?? undefined,
        leadId: input.conversation.leadId ?? undefined,
        body: input.body,
        ...(input.metadata ?? {}),
      },
    });
  } catch (err) {
    console.warn('emitChatTimeline: failed to publish timeline event (continuing):', err);
  }
}
