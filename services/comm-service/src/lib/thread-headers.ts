/**
 * RFC-5322 threading headers for outbound email.
 *
 * The SMTP channel already supports messageId / inReplyTo / references, but the
 * send paths (outbox poller, sequence poller) never populated them — so every
 * outbound email had a fresh server-assigned Message-ID and nothing tied a
 * conversation together. This produces the headers so:
 *
 *  - every email gets a STABLE, unique Message-ID derived from its outbox row,
 *    which inbound reply correlation (email-sync-service) keys off; and
 *  - every email linked to a CRM record shares a synthetic thread-root
 *    `References` token for that record, so a mail client groups all emails
 *    about the same deal / contact / account into one conversation.
 *
 * Deterministic — no per-thread state or schema column required.
 */
function mailDomain(): string {
  const from = process.env.SMTP_FROM ?? 'no-reply@nexuscrm.local';
  const m = from.match(/@([A-Za-z0-9.-]+)/);
  return m?.[1] ?? 'nexuscrm.local';
}

export function buildEmailThreadHeaders(input: {
  messageKey: string;
  entityType?: string | null;
  entityId?: string | null;
}): { messageId: string; references?: string } {
  const domain = mailDomain();
  const messageId = `<comm-${input.messageKey}@${domain}>`;
  const references =
    input.entityType && input.entityId
      ? `<thread-${input.entityType}-${input.entityId}@${domain}>`
      : undefined;
  return { messageId, references };
}
