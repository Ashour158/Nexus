import type { PaginatedResult } from '@nexus/shared-types';
import { NotFoundError } from '@nexus/service-utils';
import type { OutboxMessage } from '../../../../node_modules/.prisma/comm-client/index.js';
import type { Prisma } from '../../../../node_modules/.prisma/comm-client/index.js';
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

export function createOutboxService(
  prisma: CommPrisma,
  email: EmailChannel,
  sms: SmsChannel
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
      }
    ): Promise<OutboxMessage> {
      return prisma.outboxMessage.create({
        data: {
          tenantId,
          channel: 'EMAIL',
          to: args.to,
          subject: args.subject,
          body: args.htmlBody,
          templateId: args.templateId ?? null,
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
    ): Promise<OutboxMessage> {
      return prisma.outboxMessage.create({
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
      const rows = await prisma.outboxMessage.findMany({
        where: { tenantId, status: 'QUEUED' },
        orderBy: { createdAt: 'asc' },
        take: 50,
      });
      let sent = 0;
      let failed = 0;
      for (const row of rows) {
        try {
          if (row.channel === 'EMAIL') {
            await email.send({
              to: row.to,
              subject: row.subject ?? '(no subject)',
              html: row.body,
              text: row.body.replace(/<[^>]+>/g, ' ').slice(0, 8000),
            });
          } else if (row.channel === 'SMS') {
            await sms.send({ to: row.to, body: row.body });
          }
          await prisma.outboxMessage.update({
            where: { id: row.id },
            data: { status: 'SENT', sentAt: new Date(), errorMessage: null },
          });
          sent += 1;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          await prisma.outboxMessage.update({
            where: { id: row.id },
            data: { status: 'FAILED', errorMessage: msg },
          });
          failed += 1;
        }
      }
      return { sent, failed };
    },

    async trackOpen(messageId: string): Promise<void> {
      await prisma.outboxMessage.updateMany({
        where: { id: messageId },
        data: { openedAt: new Date(), status: 'DELIVERED' },
      });
    },

    async trackClick(messageId: string): Promise<void> {
      await prisma.outboxMessage.updateMany({
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
    ): Promise<PaginatedResult<OutboxMessage>> {
      const where: Prisma.OutboxMessageWhereInput = { tenantId };
      if (filters.status) where.status = filters.status;
      if (filters.channel) where.channel = filters.channel;
      if (filters.dateFrom || filters.dateTo) {
        where.createdAt = {};
        if (filters.dateFrom) where.createdAt.gte = filters.dateFrom;
        if (filters.dateTo) where.createdAt.lte = filters.dateTo;
      }
      const { page, limit } = pagination;
      const [total, data] = await Promise.all([
        prisma.outboxMessage.count({ where }),
        prisma.outboxMessage.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
      ]);
      return toPaginated(data, total, page, limit);
    },

    async getById(tenantId: string, id: string): Promise<OutboxMessage> {
      const row = await prisma.outboxMessage.findFirst({ where: { id, tenantId } });
      if (!row) throw new NotFoundError('OutboxMessage', id);
      return row;
    },
  };
}
