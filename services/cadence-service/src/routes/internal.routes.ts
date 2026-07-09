import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { createEnrollmentsService } from '../services/enrollments.service.js';

const ReplySignalBody = z
  .object({
    tenantId: z.string().min(1),
    contactId: z.string().min(1).optional(),
    leadId: z.string().min(1).optional(),
    objectId: z.string().min(1).optional(),
  })
  .refine((b) => Boolean(b.contactId ?? b.leadId ?? b.objectId), {
    message: 'one of contactId, leadId or objectId is required',
  });

const AutoEnrollBody = z.object({
  tenantId: z.string().min(1),
  trigger: z.string().min(1),
  entity: z.object({
    objectType: z.enum(['CONTACT', 'LEAD']),
    objectId: z.string().min(1),
    ownerId: z.string().min(1),
  }),
});

/**
 * Internal, service-token-guarded routes.
 *
 * `POST /api/v1/internal/cadence/reply-signal` lets comm-service / email-sync
 * notify cadence-service that a prospect replied. Matching ACTIVE enrollments
 * whose cadence template has exitOnReply=true are exited. Fully guarded: the
 * exit logic never throws, so a DB hiccup returns an ok-with-zero response
 * rather than a 500.
 */
export async function registerInternalRoutes(
  app: FastifyInstance,
  enrollments: ReturnType<typeof createEnrollmentsService>
): Promise<void> {
  await app.register(
    async (r) => {
      r.post('/internal/cadence/reply-signal', async (request, reply) => {
        const svcToken = request.headers['x-service-token'];
        const expectedToken = process.env.INTERNAL_SERVICE_TOKEN;
        if (!expectedToken || !svcToken || svcToken !== expectedToken) {
          return reply
            .code(401)
            .send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized', requestId: request.id } });
        }
        const body = ReplySignalBody.parse(request.body);
        const objectId = body.contactId ?? body.leadId ?? body.objectId!;
        const exited = await enrollments.exitEnrollmentsForObject(
          body.tenantId,
          objectId,
          'exitOnReply',
          'replied'
        );
        return reply.send({ success: true, data: { exited } });
      });

      /**
       * Rule-based auto-enroll hook. crm-service calls this on lead/contact
       * create (or any trigger) so matching cadences auto-enroll the entity.
       * Guarded by x-service-token; idempotent per (cadence, object).
       */
      r.post('/internal/cadence/auto-enroll', async (request, reply) => {
        const svcToken = request.headers['x-service-token'];
        const expectedToken = process.env.INTERNAL_SERVICE_TOKEN;
        if (!expectedToken || !svcToken || svcToken !== expectedToken) {
          return reply
            .code(401)
            .send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized', requestId: request.id } });
        }
        const parsed = AutoEnrollBody.safeParse(request.body);
        if (!parsed.success) {
          return reply.code(400).send({ success: false, error: { code: 'BAD_REQUEST', message: 'Invalid body', details: parsed.error.flatten() } });
        }
        const data = await enrollments.autoEnroll(parsed.data.tenantId, parsed.data.trigger, parsed.data.entity);
        return reply.send({ success: true, data });
      });
    },
    { prefix: '/api/v1' }
  );
}
