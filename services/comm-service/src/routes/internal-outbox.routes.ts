import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { createOutboxService } from '../services/outbox.service.js';

const BroadcastBody = z.object({
  tenantId: z.string().min(1),
  recipients: z.array(z.string().email()).min(1),
  subject: z.string().min(1),
  htmlBody: z.string().min(1),
});

export async function registerInternalOutboxRoutes(
  app: FastifyInstance,
  outbox: ReturnType<typeof createOutboxService>
): Promise<void> {
  await app.register(
    async (r) => {
      r.post('/internal/outbox/email-broadcast', async (request, reply) => {
        const svcToken = request.headers['x-service-token'];
        const expectedToken = process.env.INTERNAL_SERVICE_TOKEN;
        if (!expectedToken || !svcToken || svcToken !== expectedToken) {
          return reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized', requestId: request.id } });
        }
        const body = BroadcastBody.parse(request.body);
        for (const to of body.recipients) {
          await outbox.queueEmail(body.tenantId, {
            to,
            subject: body.subject,
            htmlBody: body.htmlBody,
          });
        }
        return reply.send({ success: true, data: { queued: body.recipients.length } });
      });
    },
    { prefix: '/api/v1' }
  );
}
