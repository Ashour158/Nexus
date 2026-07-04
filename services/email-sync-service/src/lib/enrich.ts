import type { NexusProducer } from '@nexus/kafka';
import { TOPICS } from '@nexus/kafka';
import { resolveContactByEmail, resolvePrimaryDealForContact } from './crm-client.js';

/** Minimal Prisma surface this module needs — avoids importing the generated type. */
export interface EnrichPrisma {
  emailMessage: {
    findFirst: (args: unknown) => Promise<Record<string, unknown> | null>;
    update: (args: unknown) => Promise<unknown>;
  };
}

export interface StoredMessage {
  id: string;
  tenantId: string;
  from: string;
  to: string;
  threadId: string;
  isInbound: boolean;
  contactId?: string | null;
  dealId?: string | null;
}

export interface EnrichHeaders {
  /** The message's own Message-ID header (already-stored RFC id). */
  rfcMessageId?: string | null;
  /** In-Reply-To header. */
  inReplyTo?: string | null;
  /** References header (space-separated Message-IDs). */
  references?: string | null;
}

export interface EnrichLogger {
  warn: (...a: unknown[]) => void;
  info?: (...a: unknown[]) => void;
}

/** Extract the bare email address from an RFC 5322 "Name <addr@host>" string. */
export function extractEmailAddress(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const angle = raw.match(/<([^>]+)>/);
  const candidate = (angle ? angle[1] : raw).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : null;
}

/** Normalize a Message-ID (strip angle brackets + surrounding whitespace). */
export function normalizeMessageId(id: string | undefined | null): string | null {
  if (!id) return null;
  const trimmed = id.trim().replace(/^<|>$/g, '').trim();
  return trimmed || null;
}

/**
 * Parse the parent Message-ID candidates from In-Reply-To / References headers,
 * most-recent-first. References is space-separated with the immediate parent last,
 * so we reverse it. In-Reply-To (if present) is the most authoritative parent.
 */
export function parseParentMessageIds(headers: EnrichHeaders): string[] {
  const ids: string[] = [];
  const inReplyTo = normalizeMessageId(headers.inReplyTo);
  if (inReplyTo) ids.push(inReplyTo);
  if (headers.references) {
    const refs = headers.references
      .split(/\s+/)
      .map((r) => normalizeMessageId(r))
      .filter((r): r is string => Boolean(r))
      .reverse();
    for (const r of refs) if (!ids.includes(r)) ids.push(r);
  }
  return ids;
}

/** Does a parent id look like a comm-service meeting id? Returns the activityId. */
export function meetingActivityIdFromParent(parentId: string): string | null {
  const m = parentId.match(/^meeting-(.+)@nexuscrm$/);
  return m ? m[1] : null;
}

/**
 * Correlate an inbound message to an existing thread using its parent Message-IDs.
 * Looks up any prior stored message whose rfcMessageId matches a parent id and,
 * if found, adopts that message's threadId + contactId/dealId links. This groups
 * replies (including replies to comm-service meeting emails, whose Message-ID is
 * `<meeting-{activityId}@nexuscrm>`) onto the original thread.
 *
 * Returns the correlated thread info, or null if no parent match was found.
 */
export async function correlateThread(
  prisma: EnrichPrisma,
  tenantId: string,
  parentIds: string[]
): Promise<{ threadId: string; contactId?: string | null; dealId?: string | null } | null> {
  for (const parentId of parentIds) {
    const parent = await prisma.emailMessage.findFirst({
      where: { tenantId, rfcMessageId: parentId },
      orderBy: { sentAt: 'asc' },
    } as unknown as never);
    if (parent) {
      return {
        threadId: (parent.threadId as string) ?? '',
        contactId: (parent.contactId as string | null) ?? null,
        dealId: (parent.dealId as string | null) ?? null,
      };
    }
  }
  return null;
}

export interface EnrichResult {
  contactId?: string | null;
  dealId?: string | null;
  accountId?: string | null;
  threadId?: string;
  correlated: boolean;
  meetingActivityId?: string | null;
}

/**
 * Enrich a freshly-stored message: correlate its thread, resolve the counterparty
 * email to a CRM contact/deal, persist the links, and emit an activity event so
 * the message appears on the CRM timeline. Fully fail-open: any error is logged
 * and swallowed so ingestion never breaks.
 *
 * @param counterpartyEmail the address to resolve (inbound: the sender; outbound: the recipient)
 */
export async function enrichMessage(opts: {
  prisma: EnrichPrisma;
  producer?: NexusProducer | null;
  log: EnrichLogger;
  message: StoredMessage;
  headers: EnrichHeaders;
  counterpartyEmail: string | null;
  subject: string;
  sentAt: Date;
}): Promise<EnrichResult> {
  const { prisma, producer, log, message, headers, counterpartyEmail, subject, sentAt } = opts;
  const result: EnrichResult = { correlated: false };
  try {
    const parentIds = parseParentMessageIds(headers);

    // 1. Thread / reply correlation against previously stored messages.
    const correlated = await correlateThread(prisma, message.tenantId, parentIds).catch(() => null);
    let threadId = message.threadId;
    let contactId = message.contactId ?? null;
    let dealId = message.dealId ?? null;
    let accountId: string | null = null;
    let meetingActivityId: string | null = null;

    for (const p of parentIds) {
      const act = meetingActivityIdFromParent(p);
      if (act) {
        meetingActivityId = act;
        break;
      }
    }

    if (correlated) {
      result.correlated = true;
      if (correlated.threadId) threadId = correlated.threadId;
      contactId = contactId ?? correlated.contactId ?? null;
      dealId = dealId ?? correlated.dealId ?? null;
    }

    // 2. Resolve the counterparty email → contact (+ its deal / account) if still unlinked.
    if (!contactId && counterpartyEmail) {
      const resolved = await resolveContactByEmail(message.tenantId, counterpartyEmail).catch(() => null);
      if (resolved) {
        contactId = resolved.contactId;
        accountId = resolved.accountId ?? null;
        if (!dealId) {
          dealId = await resolvePrimaryDealForContact(message.tenantId, resolved.contactId).catch(() => null);
        }
      }
    }

    result.contactId = contactId;
    result.dealId = dealId;
    result.accountId = accountId;
    result.threadId = threadId;
    result.meetingActivityId = meetingActivityId;

    // 3. Persist enrichment (only fields that changed / were resolved).
    const needsUpdate =
      threadId !== message.threadId ||
      (contactId && contactId !== message.contactId) ||
      (dealId && dealId !== message.dealId) ||
      accountId;
    if (needsUpdate) {
      await prisma.emailMessage
        .update({
          where: { id: message.id },
          data: {
            threadId,
            ...(contactId ? { contactId } : {}),
            ...(dealId ? { dealId } : {}),
            ...(accountId ? { accountId } : {}),
          },
        } as unknown as never)
        .catch((err: unknown) => log.warn({ err, id: message.id }, 'enrich: persist links failed'));
    }

    // 4. Emit an activity/comm event so the email shows on the timeline.
    //    Only emit when we can attach it to something (a contact, deal, or meeting),
    //    to avoid flooding the timeline with unlinked noise.
    if (producer?.isConnected() && (contactId || dealId || meetingActivityId)) {
      const type = message.isInbound ? 'email.received' : 'email.sent';
      await producer
        .publish(TOPICS.EMAILS, {
          type,
          tenantId: message.tenantId,
          payload: {
            messageId: message.id,
            threadId,
            direction: message.isInbound ? 'INBOUND' : 'OUTBOUND',
            subject,
            from: message.from,
            to: message.to,
            contactId: contactId ?? undefined,
            dealId: dealId ?? undefined,
            accountId: accountId ?? undefined,
            meetingActivityId: meetingActivityId ?? undefined,
            isReply: result.correlated || parentIds.length > 0,
            occurredAt: sentAt.toISOString(),
          },
        })
        .catch((err: unknown) => log.warn({ err, id: message.id }, 'enrich: emit email event failed'));

      // A correlated inbound message is a reply — emit the reply signal too so
      // cadences can exit-on-reply. Separate event; independently fail-open.
      if (message.isInbound && (result.correlated || meetingActivityId) && contactId) {
        await producer
          .publish(TOPICS.EMAILS, {
            type: 'email.replied',
            tenantId: message.tenantId,
            payload: {
              messageId: message.id,
              threadId,
              contactId,
              dealId: dealId ?? undefined,
              meetingActivityId: meetingActivityId ?? undefined,
            },
          })
          .catch((err: unknown) => log.warn({ err, id: message.id }, 'enrich: emit reply event failed'));
      }
    }
  } catch (err) {
    log.warn({ err, id: message.id }, 'enrich: unexpected error (swallowed)');
  }
  return result;
}
