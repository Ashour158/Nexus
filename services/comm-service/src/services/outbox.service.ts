import type { PaginatedResult } from '@nexus/shared-types';
import { NotFoundError } from '@nexus/service-utils';
import { TOPICS, type NexusProducer } from '@nexus/kafka';
type CommOutbox = any;
import type { CommPrisma } from '../prisma.js';
import type { EmailChannel } from '../channels/smtp.channel.js';
import type { SmsChannel } from '../channels/sms.channel.js';

function toPaginated<T>(
  rows: T[],
  total: number,
  page: number,
  limit: number
): PaginatedResult<T> {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    data: rows,
    total,
    page,
    limit,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}

/**
 * Resolves an EmailChannel that sends THROUGH a specific user MailAccount.
 * Supplied by the mail-accounts service; may throw if the account is
 * missing/inactive/uncredentialed (the send loop catches it → row FAILED).
 */
export type ResolveAccountChannel = (
  tenantId: string,
  mailAccountId: string
) => Promise<EmailChannel>;

export function createOutboxService(
  prisma: CommPrisma,
  email: EmailChannel,
  sms: SmsChannel,
  producer?: NexusProducer,
  resolveAccountChannel?: ResolveAccountChannel
) {
  return {
    async queueEmail(
      tenantId: string,
      args: {
        to: string;
        subject: string;
        htmlBody: string;
        textBody?: string;
        templateId?: string;
        entityType?: string;
        entityId?: string;
        /** Optional user MailAccount to send from; null → system SMTP. */
        mailAccountId?: string;
      }
    ): Promise<CommOutbox> {
      return (prisma as any).commOutbox.create({
        data: {
          tenantId,
          channel: 'EMAIL',
          to: args.to,
          subject: args.subject,
          body: args.htmlBody,
          templateId: args.templateId ?? null,
          mailAccountId: args.mailAccountId ?? null,
          entityType: args.entityType ?? null,
          entityId: args.entityId ?? null,
          status: 'QUEUED',
        },
      });
    },

    async queueSms(
      tenantId: string,
      args: {
        to: string;
        body: string;
        templateId?: string;
        entityType?: string;
        entityId?: string;
      }
    ): Promise<CommOutbox> {
      return (prisma as any).commOutbox.create({
        data: {
          tenantId,
          channel: 'SMS',
          to: args.to,
          subject: null,
          body: args.body,
          templateId: args.templateId ?? null,
          entityType: args.entityType ?? null,
          entityId: args.entityId ?? null,
          status: 'QUEUED',
        },
      });
    },

    async processQueue(tenantId: string): Promise<{ sent: number; failed: number }> {
      const rows = await (prisma as any).commOutbox.findMany({
        where: { tenantId, status: 'QUEUED' },
        orderBy: { createdAt: 'asc' },
        take: 50,
      });
      let sent = 0;
      let failed = 0;
      // Process with bounded concurrency to improve throughput under load
      const CONCURRENCY = 10;
      for (let i = 0; i < rows.length; i += CONCURRENCY) {
        const chunk = rows.slice(i, i + CONCURRENCY);
        const results = await Promise.allSettled(
          chunk.map(async (row: any): Promise<'sent' | 'skipped'> => {
            // Atomically claim the row QUEUED -> PROCESSING BEFORE sending. If a
            // second concurrent poller already claimed it, count!==1 and we bail
            // out without sending — this prevents the double-send race.
            const claim = await (prisma as any).commOutbox.updateMany({
              where: { id: row.id, status: 'QUEUED' },
              data: { status: 'PROCESSING' },
            });
            if (claim.count !== 1) return 'skipped';
            if (row.channel === 'EMAIL') {
              // Send through the user's own MailAccount when one is attached;
              // otherwise use the global/system SMTP transport. A bad user
              // account throws here → caught by allSettled → row marked FAILED
              // with a clear message; the worker never crashes.
              const channel =
                row.mailAccountId && resolveAccountChannel
                  ? await resolveAccountChannel(tenantId, row.mailAccountId)
                  : email;
              await channel.send({
                to: row.to,
                subject: row.subject ?? '(no subject)',
                html: row.body,
                text: row.body.replace(/<[^>]+>/g, ' ').slice(0, 8000),
              });
            } else if (row.channel === 'SMS') {
              await sms.send({ to: row.to, body: row.body });
            }
            await (prisma as any).commOutbox.update({
              where: { id: row.id },
              data: { status: 'SENT', sentAt: new Date(), errorMessage: null },
            });
            // Nervous system: emit email.sent so crm's engagement-timeline
            // consumer logs an Activity on the linked contact/account/deal. Only
            // for entity-linked EMAILs; fire-and-forget so Kafka never blocks send.
            if (row.channel === 'EMAIL' && producer && row.entityId) {
              const et = String(row.entityType ?? '').toUpperCase();
              const link: Record<string, string> = {};
              if (et === 'CONTACT') link.contactId = row.entityId;
              else if (et === 'ACCOUNT') link.accountId = row.entityId;
              else if (et === 'DEAL') link.dealId = row.entityId;
              void producer
                .publish(TOPICS.EMAILS, {
                  type: 'email.sent',
                  tenantId,
                  payload: {
                    messageId: row.id,
                    direction: 'OUTBOUND',
                    subject: row.subject ?? '',
                    to: row.to,
                    ...link,
                    occurredAt: new Date().toISOString(),
                  },
                })
                .catch(() => undefined);
            }
            return 'sent';
          })
        );
        for (let r = 0; r < results.length; r++) {
          const res = results[r];
          if (res.status === 'fulfilled') {
            // 'skipped' → another poller claimed the row; don't count it.
            if (res.value === 'sent') sent += 1;
          } else {
            const rejected = res as PromiseRejectedResult;
            const msg = rejected.reason instanceof Error
              ? rejected.reason.message
              : String(rejected.reason);
            await (prisma as any).commOutbox.update({
              where: { id: chunk[r].id },
              data: { status: 'FAILED', errorMessage: msg },
            });
            failed += 1;
          }
        }
      }
      return { sent, failed };
    },

    async trackOpen(messageId: string): Promise<void> {
      await (prisma as any).commOutbox.updateMany({
        where: { id: messageId },
        data: { openedAt: new Date(), status: 'DELIVERED' },
      });
    },

    async trackClick(messageId: string): Promise<void> {
      await (prisma as any).commOutbox.updateMany({
        where: { id: messageId },
        data: { clickedAt: new Date() },
      });
    },

    async listOutbox(
      tenantId: string,
      filters: {
        status?: string;
        channel?: string;
        dateFrom?: Date;
        dateTo?: Date;
      },
      pagination: { page: number; limit: number }
    ): Promise<PaginatedResult<CommOutbox>> {
      const where: any = { tenantId };
      if (filters.status) where.status = filters.status;
      if (filters.channel) where.channel = filters.channel;
      if (filters.dateFrom || filters.dateTo) {
        where.createdAt = {};
        if (filters.dateFrom) where.createdAt.gte = filters.dateFrom;
        if (filters.dateTo) where.createdAt.lte = filters.dateTo;
      }
      const { page, limit } = pagination;
      const [total, data] = await Promise.all([
        (prisma as any).commOutbox.count({ where }),
        (prisma as any).commOutbox.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
      ]);
      return toPaginated(data, total, page, limit);
    },

    async getById(tenantId: string, id: string): Promise<CommOutbox> {
      const row = await (prisma as any).commOutbox.findFirst({ where: { id, tenantId } });
      if (!row) throw new NotFoundError('CommOutbox', id);
      return row;
    },
  };
}
