import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { createOutboxService } from '../services/outbox.service.js';

const TrackSchema = z.object({
  messageId: z.string().min(1),
  kind: z.enum(['open', 'click']),
});

export async function registerWebhookRoutes(
  app: FastifyInstance,
  outbox: ReturnType<typeof createOutboxService>
): Promise<void> {
  await app.register(
    async (r) => {
      r.post('/webhooks/track', async (request, reply) => {
        const parsed = TrackSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.code(400).send({ success: false, error: parsed.error.flatten() });
        }
        if (parsed.data.kind === 'open') {
          await outbox.trackOpen(parsed.data.messageId);
        } else {
          await outbox.trackClick(parsed.data.messageId);
        }
        return reply.send({ success: true, data: { ok: true } });
      });
    },
    { prefix: '/api/v1' }
  );
}
