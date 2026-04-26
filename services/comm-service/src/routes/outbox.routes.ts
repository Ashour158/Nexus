import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission, ValidationError } from '@nexus/service-utils';
import { PaginationSchema } from '@nexus/validation';
import { z } from 'zod';
import type { createOutboxService } from '../services/outbox.service.js';

const ListOutboxQuery = PaginationSchema.extend({
  status: z.string().optional(),
  channel: z.string().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});

const SendEmailSchema = z.object({
  channel: z.literal('EMAIL'),
  to: z.string().email(),
  subject: z.string().min(1),
  htmlBody: z.string().min(1),
  textBody: z.string().optional(),
  templateId: z.string().optional(),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
});

const SendSmsSchema = z.object({
  channel: z.literal('SMS'),
  to: z.string().min(3),
  body: z.string().min(1).max(1600),
  templateId: z.string().optional(),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
});

const SendSchema = z.discriminatedUnion('channel', [SendEmailSchema, SendSmsSchema]);

export async function registerOutboxRoutes(
  app: FastifyInstance,
  outbox: ReturnType<typeof createOutboxService>
): Promise<void> {
  await app.register(
    async (r) => {
      r.get(
        '/outbox',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) },
        async (request, reply) => {
          const parsed = ListOutboxQuery.safeParse(request.query);
          if (!parsed.success) throw new ValidationError('Invalid query', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const { page, limit, status, channel, dateFrom, dateTo } = parsed.data;
          const result = await outbox.listOutbox(
            jwt.tenantId,
            { status, channel, dateFrom, dateTo },
            { page, limit }
          );
          return reply.send({ success: true, data: result });
        }
      );

      r.post(
        '/outbox/send',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const parsed = SendSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const body = parsed.data;
          if (body.channel === 'EMAIL') {
            const row = await outbox.queueEmail(jwt.tenantId, {
              to: body.to,
              subject: body.subject,
              htmlBody: body.htmlBody,
              textBody: body.textBody,
              templateId: body.templateId,
              entityType: body.entityType,
              entityId: body.entityId,
            });
            return reply.code(201).send({ success: true, data: row });
          }
          const row = await outbox.queueSms(jwt.tenantId, {
            to: body.to,
            body: body.body,
            templateId: body.templateId,
            entityType: body.entityType,
            entityId: body.entityId,
          });
          return reply.code(201).send({ success: true, data: row });
        }
      );

      r.post(
        '/outbox/process-queue',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const result = await outbox.processQueue(jwt.tenantId);
          return reply.send({ success: true, data: result });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
