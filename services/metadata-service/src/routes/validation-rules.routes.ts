import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission, ValidationError } from '@nexus/service-utils';
import { z } from 'zod';
import { IdParamSchema } from '@nexus/validation';
import type { MetadataPrisma } from '../prisma.js';
import { createValidationRulesService } from '../services/validation-rules.service.js';

const CreateRuleBody = z.object({
  objectType: z.string().min(1).max(40),
  name: z.string().min(1).max(200),
  condition: z.record(z.unknown()),
  requirement: z.record(z.unknown()),
  errorMessage: z.string().min(1).max(1000),
});

export async function registerValidationRulesRoutes(
  app: FastifyInstance,
  prisma: MetadataPrisma
): Promise<void> {
  const service = createValidationRulesService(prisma);

  await app.register(
    async (r) => {
      r.get(
        '/validation-rules',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { objectType } = request.query as { objectType?: string };
          const rows = await service.listRules(jwt.tenantId, objectType);
          return reply.send({ success: true, data: rows });
        }
      );

      r.post(
        '/validation-rules',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const parsed = CreateRuleBody.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const row = await service.createRule(jwt.tenantId, parsed.data);
          return reply.code(201).send({ success: true, data: row });
        }
      );

      // POST /api/v1/validation-rules/validate
      // Body: { objectType: string, payload: Record<string, unknown> }
      // Returns: { valid, rulesEvaluated, violations: [{ruleId,ruleName,errorMessage}], errors: string[] }
      // FAIL-OPEN: on any internal error we return valid:true so a broken rule
      // engine never blocks a caller's write path.
      r.post(
        '/validation-rules/validate',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const body = request.body as { objectType?: string; payload?: Record<string, unknown> };
          if (!body.objectType?.trim()) {
            return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'objectType required', requestId: request.id } });
          }
          try {
            const rules = await prisma.validationRule.findMany({
              where: { tenantId: jwt.tenantId, objectType: body.objectType, isActive: true },
            });
            const result = service.validate(body.objectType, body.payload ?? {}, rules);
            return reply.send({ success: true, data: result });
          } catch (err) {
            request.log.warn({ err, objectType: body.objectType }, 'validation evaluation failed; returning valid (fail-open)');
            return reply.send({ success: true, data: { valid: true, rulesEvaluated: 0, violations: [], errors: [] } });
          }
        }
      );

      r.get(
        '/validation-rules/:id',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const row = await service.getRuleById(jwt.tenantId, id);
          return reply.send({ success: true, data: row });
        }
      );

      r.patch(
        '/validation-rules/:id',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const body = request.body as { isActive?: boolean; errorMessage?: string; name?: string; condition?: Record<string, unknown>; requirement?: Record<string, unknown> };
          const jwt = request.user as JwtPayload;
          const row = await service.updateRule(jwt.tenantId, id, body);
          return reply.send({ success: true, data: row });
        }
      );

      r.delete(
        '/validation-rules/:id',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          await service.deleteRule(jwt.tenantId, id);
          return reply.send({ success: true, data: { id, deleted: true } });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
