import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import crypto from 'node:crypto';
import type { createOutboxService } from '../services/outbox.service.js';

const TRACKING_SECRET = process.env.TRACKING_SECRET ?? '';

const TrackSchema = z.object({
  messageId: z.string().min(1),
  kind: z.enum(['open', 'click']),
});

function verifyTrackingToken(messageId: string, token: string): boolean {
  if (!TRACKING_SECRET) return false;
  const expected = crypto.createHmac('sha256', TRACKING_SECRET).update(messageId).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

export async function registerWebhookRoutes(
  app: FastifyInstance,
  outbox: ReturnType<typeof createOutboxService>
): Promise<void> {
  await app.register(
    async (r) => {
      r.post('/webhooks/track', async (request, reply) => {
        const query = request.query as Record<string, string | undefined>;
        const token = query.trackingToken;
        if (!token) {
          return reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing trackingToken', requestId: request.id } });
        }
        const parsed = TrackSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: parsed.error.flatten(), requestId: request.id } });
        }
        if (!verifyTrackingToken(parsed.data.messageId, token)) {
          return reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid tracking token', requestId: request.id } });
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
