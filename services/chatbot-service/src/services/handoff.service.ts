import type { NexusProducer } from '@nexus/kafka';
import { TOPICS } from '@nexus/kafka';
import type { Conversation } from '../../../../node_modules/.prisma/chatbot-client/index.js';

/**
 * Handoff-to-human.
 *
 * When the rules-only intent layer cannot serve a message (no intent matched,
 * an intent explicitly asks for an agent, or intent matching errored), the
 * conversation is escalated to a human. We do that by emitting a
 * `notification.created` event on {@link TOPICS.NOTIFICATIONS} — the same event
 * shape notification-service already consumes — so a human/notification is
 * triggered. The caller separately marks the session HANDED_OFF.
 *
 * Additive + fail-open: any failure (producer not connected, Kafka down) is
 * swallowed with a warning so the webhook request never breaks.
 */
export interface HandoffInput {
  conversation: Pick<Conversation, 'id' | 'tenantId' | 'channel' | 'externalId'>;
  /** The message that triggered the handoff. */
  message: string;
  /** Machine-readable reason, e.g. 'customer_requested_agent' | 'no_intent_match'. */
  reason: string;
}

export async function emitHandoff(
  producer: NexusProducer | null | undefined,
  input: HandoffInput
): Promise<boolean> {
  if (!producer) return false;
  try {
    const { conversation, message, reason } = input;
    await producer.publish(TOPICS.NOTIFICATIONS, {
      type: 'notification.created',
      tenantId: conversation.tenantId,
      payload: {
        notificationType: 'CHATBOT_HANDOFF',
        title: `Chatbot handoff (${conversation.channel})`,
        body: `A ${conversation.channel} conversation needs a human. Reason: ${reason}. Last message: "${truncate(message, 300)}"`,
        entityType: 'conversation',
        entityId: conversation.id,
        actionUrl: `/conversations/${conversation.id}`,
        metadata: {
          channel: conversation.channel,
          externalId: conversation.externalId,
          reason,
        },
      },
    });
    return true;
  } catch (err) {
    console.warn('emitHandoff: failed to publish handoff event (continuing):', err);
    return false;
  }
}

function truncate(s: string, max: number): string {
  const str = (s ?? '').toString();
  return str.length > max ? `${str.slice(0, max)}…` : str;
}
