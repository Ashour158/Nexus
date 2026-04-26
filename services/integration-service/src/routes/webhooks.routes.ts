import type { FastifyInstance } from 'fastify';
import { PERMISSIONS, ValidationError, requirePermission } from '@nexus/service-utils';
import {
  CreateWebhookSubscriptionSchema,
  IdParamSchema,
  UpdateWebhookSubscriptionSchema,
} from '@nexus/validation';
import type { createWebhooksService } from '../services/webhooks.service.js';

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
          return reply.code(204).send();
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
