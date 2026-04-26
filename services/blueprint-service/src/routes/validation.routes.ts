import type { FastifyInstance } from 'fastify';
import { PERMISSIONS, ValidationError, requirePermission } from '@nexus/service-utils';
import { UpsertValidationRuleSchema } from '@nexus/validation';
import { z } from 'zod';
import type { createValidationService } from '../services/validation.service.js';

const PipelineQuery = z.object({
  pipelineId: z.string().min(1),
});

export async function registerValidationRoutes(
  app: FastifyInstance,
  validation: ReturnType<typeof createValidationService>
): Promise<void> {
  await app.register(
    async (r) => {
      r.get(
        '/blueprints/validation/rules',
        { preHandler: requirePermission(PERMISSIONS.BLUEPRINTS.READ) },
        async (request, reply) => {
          const q = PipelineQuery.safeParse(request.query);
          if (!q.success) throw new ValidationError('Invalid query', q.error.flatten());
          const rows = await validation.listRules(q.data.pipelineId);
          return reply.send({ success: true, data: rows });
        }
      );

      r.put(
        '/blueprints/validation/rules',
        { preHandler: requirePermission(PERMISSIONS.BLUEPRINTS.MANAGE) },
        async (request, reply) => {
          const parsed = UpsertValidationRuleSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const row = await validation.upsertRule(parsed.data);
          return reply.send({ success: true, data: row });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
