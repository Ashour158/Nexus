import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PERMISSIONS, ValidationError, requirePermission } from '@nexus/service-utils';
import {
  CreateWebhookSubscriptionSchema,
  IdParamSchema,
  UpdateWebhookSubscriptionSchema,
} from '@nexus/validation';
import type { createWebhooksService } from '../services/webhooks.service.js';

const DeliveryListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function registerWebhooksRoutes(
  app: FastifyInstance,
  webhooks: ReturnType<typeof createWebhooksService>
): Promise<void> {
  await app.register(
    async (r) => {
      r.get(
        '/integrations/webhooks',
        { preHandler: requirePermission(PERMISSIONS.INTEGRATIONS.READ) },
        async (_request, reply) => {
          const rows = await webhooks.listSubscriptions();
          return reply.send({ success: true, data: rows });
        }
      );

      r.post(
        '/integrations/webhooks',
        { preHandler: requirePermission(PERMISSIONS.INTEGRATIONS.MANAGE) },
        async (request, reply) => {
          const parsed = CreateWebhookSubscriptionSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const result = await webhooks.createSubscription(parsed.data);
          return reply.code(201).send({ success: true, data: result });
        }
      );

      r.patch(
        '/integrations/webhooks/:id',
        { preHandler: requirePermission(PERMISSIONS.INTEGRATIONS.MANAGE) },
        async (request, reply) => {
          const params = IdParamSchema.safeParse(request.params);
          if (!params.success) throw new ValidationError('Invalid params', params.error.flatten());
          const parsed = UpdateWebhookSubscriptionSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const row = await webhooks.updateSubscription(params.data.id, parsed.data);
          return reply.send({ success: true, data: row });
        }
      );

      r.delete(
        '/integrations/webhooks/:id',
        { preHandler: requirePermission(PERMISSIONS.INTEGRATIONS.MANAGE) },
        async (request, reply) => {
          const params = IdParamSchema.safeParse(request.params);
          if (!params.success) throw new ValidationError('Invalid params', params.error.flatten());
          await webhooks.deleteSubscription(params.data.id);
          return reply.send({ success: true, data: { id: params.data.id, deleted: true } });
        }
      );

      r.get(
        '/integrations/webhooks/:subscriptionId/deliveries',
        { preHandler: requirePermission(PERMISSIONS.INTEGRATIONS.READ) },
        async (request, reply) => {
          const params = z
            .object({ subscriptionId: z.string().cuid() })
            .safeParse(request.params);
          if (!params.success) throw new ValidationError('Invalid params', params.error.flatten());
          const query = DeliveryListQuerySchema.safeParse(request.query);
          if (!query.success) throw new ValidationError('Invalid query', query.error.flatten());
          const result = await webhooks.listDeliveries(params.data.subscriptionId, query.data);
          return reply.send({ success: true, ...result });
        }
      );

      r.get(
        '/integrations/webhooks/deliveries/:id',
        { preHandler: requirePermission(PERMISSIONS.INTEGRATIONS.READ) },
        async (request, reply) => {
          const params = IdParamSchema.safeParse(request.params);
          if (!params.success) throw new ValidationError('Invalid params', params.error.flatten());
          const row = await webhooks.getDelivery(params.data.id);
          if (!row) {
            return reply
              .code(404)
              .send({ success: false, error: { code: 'NOT_FOUND', message: 'Delivery not found' } });
          }
          return reply.send({ success: true, data: row });
        }
      );

      r.post(
        '/integrations/webhooks/:id/rotate-secret',
        { preHandler: requirePermission(PERMISSIONS.INTEGRATIONS.MANAGE) },
        async (request, reply) => {
          const params = IdParamSchema.safeParse(request.params);
          if (!params.success) throw new ValidationError('Invalid params', params.error.flatten());
          const result = await webhooks.rotateSecret(params.data.id);
          return reply.send({ success: true, data: result });
        }
      );

      r.post(
        '/integrations/webhooks/deliveries/:id/replay',
        { preHandler: requirePermission(PERMISSIONS.INTEGRATIONS.MANAGE) },
        async (request, reply) => {
          const params = IdParamSchema.safeParse(request.params);
          if (!params.success) throw new ValidationError('Invalid params', params.error.flatten());
          const ok = await webhooks.replayDelivery(params.data.id);
          if (!ok) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Delivery not found or subscription inactive' } });
          return reply.send({ success: true, data: { id: params.data.id, replayed: true } });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
