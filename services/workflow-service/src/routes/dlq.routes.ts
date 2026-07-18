import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@nexus/shared-types';
import type { NexusProducer } from '@nexus/kafka';
import { PERMISSIONS, ValidationError, requirePermission } from '@nexus/service-utils';
import type { WorkflowPrisma } from '../prisma.js';
import { createDlqService } from '../services/dlq.service.js';

const IdParamSchema = z.object({ id: z.string().cuid() });

const ListQuerySchema = z.object({
  status: z.enum(['PENDING', 'REPLAYED', 'DISCARDED']).optional(),
  topic: z.string().min(1).max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

const ReplayBatchSchema = z.object({
  topic: z.string().min(1).max(200),
});

/**
 * WF-OPS admin surface: dead-letter (DLQ) inspection + replay. Reads are gated by
 * `settings:read`, mutations (replay/discard) by `settings:write`. Every handler
 * is tenant-scoped off the JWT.
 */
export async function registerDlqRoutes(
  app: FastifyInstance,
  prisma: WorkflowPrisma,
  producer: NexusProducer
): Promise<void> {
  const svc = createDlqService(prisma, producer);

  await app.register(
    async (r) => {
      // Ops dashboard — counts by topic + status. Declared before `/:id` so the
      // literal path wins over the param route.
      r.get(
        '/dlq/stats',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const data = await svc.stats(jwt.tenantId);
          return reply.send({ success: true, data });
        }
      );

      r.get(
        '/dlq',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) },
        async (request, reply) => {
          const parsed = ListQuerySchema.safeParse(request.query);
          if (!parsed.success) throw new ValidationError('Invalid query', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const data = await svc.list(jwt.tenantId, parsed.data);
          return reply.send({ success: true, data });
        }
      );

      r.get(
        '/dlq/:id',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) },
        async (request, reply) => {
          const id = IdParamSchema.parse(request.params).id;
          const jwt = request.user as JwtPayload;
          const data = await svc.get(jwt.tenantId, id);
          return reply.send({ success: true, data });
        }
      );

      r.post(
        '/dlq/:id/replay',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.WRITE) },
        async (request, reply) => {
          const id = IdParamSchema.parse(request.params).id;
          const jwt = request.user as JwtPayload;
          const data = await svc.replay(jwt.tenantId, id);
          return reply.send({ success: true, data });
        }
      );

      r.post(
        '/dlq/:id/discard',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.WRITE) },
        async (request, reply) => {
          const id = IdParamSchema.parse(request.params).id;
          const jwt = request.user as JwtPayload;
          const data = await svc.discard(jwt.tenantId, id);
          return reply.send({ success: true, data });
        }
      );

      r.post(
        '/dlq/replay-batch',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.WRITE) },
        async (request, reply) => {
          const parsed = ReplayBatchSchema.safeParse(request.body ?? {});
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const data = await svc.replayBatch(jwt.tenantId, parsed.data.topic);
          return reply.send({ success: true, data });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
