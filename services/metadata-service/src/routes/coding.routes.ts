import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission, ValidationError } from '@nexus/service-utils';
import {
  CreateCodingRuleSchema,
  IdParamSchema,
  UpdateCodingRuleSchema,
  PreviewCodingRuleSchema,
  AllocateCodeSchema,
} from '@nexus/validation';
import type { MetadataPrisma } from '../prisma.js';
import { createCodingService, type AllocationContext } from '../services/coding.service.js';

export async function registerCodingRoutes(
  app: FastifyInstance,
  prisma: MetadataPrisma
): Promise<void> {
  const service = createCodingService(prisma);

  await app.register(
    async (r) => {
      // Public admin routes
      r.get(
        '/coding-rules',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { entityType } = request.query as { entityType?: string };
          const rows = await service.listCodingRules(jwt.tenantId, entityType);
          return reply.send({ success: true, data: rows });
        }
      );

      r.post(
        '/coding-rules',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const parsed = CreateCodingRuleSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const row = await service.createCodingRule(jwt.tenantId, parsed.data);
          return reply.code(201).send({ success: true, data: row });
        }
      );

      r.get(
        '/coding-rules/:id',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const row = await service.getCodingRule(jwt.tenantId, id);
          if (!row) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Coding rule not found' } });
          return reply.send({ success: true, data: row });
        }
      );

      r.patch(
        '/coding-rules/:id',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const parsed = UpdateCodingRuleSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const row = await service.updateCodingRule(jwt.tenantId, id, parsed.data);
          return reply.send({ success: true, data: row });
        }
      );

      r.post(
        '/coding-rules/:id/preview',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const parsed = PreviewCodingRuleSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const rule = await service.getCodingRule(jwt.tenantId, id);
          if (!rule) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Coding rule not found' } });
          const sampleCode = await service.previewCode(rule, {
            tenantId: jwt.tenantId,
            ...parsed.data.sampleInputs,
          } as AllocationContext);
          return reply.send({ success: true, data: { previewCode: sampleCode } });
        }
      );

      r.post(
        '/coding-rules/:id/activate',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const row = await service.activateCodingRule(jwt.tenantId, id);
          return reply.send({ success: true, data: row });
        }
      );

      // Internal allocation endpoint (service-to-service, no user auth required)
      r.post(
        '/internal/codes/:entityType/allocate',
        async (request, reply) => {
          const { entityType } = request.params as { entityType: string };
          const parsed = AllocateCodeSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());

          try {
            const result = await service.allocateCode(parsed.data.tenantId, entityType, parsed.data);
            return reply.send({ success: true, data: result });
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Allocation failed';
            if (message.startsWith('NO_CODING_RULE')) {
              return reply.code(404).send({ success: false, error: { code: 'NO_CODING_RULE', message } });
            }
            if (message.startsWith('CODE_CONFLICT')) {
              return reply.code(409).send({ success: false, error: { code: 'CODE_CONFLICT', message } });
            }
            return reply.code(400).send({ success: false, error: { code: 'ALLOCATION_FAILED', message } });
          }
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
