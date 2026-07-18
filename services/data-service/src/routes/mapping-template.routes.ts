import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { DataPrisma } from '../prisma.js';
import { createMappingTemplateService } from '../services/mapping-template.service.js';

const IdParams = z.object({ id: z.string().cuid() });
const QuerySchema = z.object({
  module: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const MappingSchema = z.object({
  sourceColumn: z.string().min(1),
  targetField: z.string().min(1),
  transform: z.string().optional(),
});

const CreateBody = z.object({
  name: z.string().min(1),
  module: z.string().min(1),
  mappings: z.array(MappingSchema).min(1),
});

const UpdateBody = z.object({
  name: z.string().min(1).optional(),
  module: z.string().min(1).optional(),
  mappings: z.array(MappingSchema).min(1).optional(),
});

export async function registerMappingTemplateRoutes(app: FastifyInstance, prisma: DataPrisma) {
  const service = createMappingTemplateService(prisma);

  app.post(
    '/api/v1/import/mapping-templates',
    { preHandler: requirePermission(PERMISSIONS.DATA.IMPORT) },
    async (request, reply) => {
      const body = CreateBody.parse(request.body);
      const user = (request as any).user as { tenantId: string; sub?: string; userId?: string };
      const createdBy = user.userId ?? user.sub ?? 'system';
      const item = await service.create(user.tenantId, createdBy, body);
      return reply.code(201).send({ success: true, data: item });
    }
  );

  app.get(
    '/api/v1/import/mapping-templates',
    { preHandler: requirePermission(PERMISSIONS.DATA.IMPORT) },
    async (request, reply) => {
      const q = QuerySchema.parse(request.query);
      const user = (request as any).user as { tenantId: string };
      const data = await service.list(user.tenantId, q.module, q.page, q.limit);
      return reply.send({ success: true, data });
    }
  );

  app.get(
    '/api/v1/import/mapping-templates/:id',
    { preHandler: requirePermission(PERMISSIONS.DATA.IMPORT) },
    async (request, reply) => {
      const { id } = IdParams.parse(request.params);
      const user = (request as any).user as { tenantId: string };
      const item = await service.get(user.tenantId, id);
      if (!item)
        return reply
          .code(404)
          .send({ success: false, error: { code: 'NOT_FOUND', message: 'Not found', requestId: request.id } });
      return reply.send({ success: true, data: item });
    }
  );

  app.patch(
    '/api/v1/import/mapping-templates/:id',
    { preHandler: requirePermission(PERMISSIONS.DATA.IMPORT) },
    async (request, reply) => {
      const { id } = IdParams.parse(request.params);
      const body = UpdateBody.parse(request.body);
      const user = (request as any).user as { tenantId: string };
      const item = await service.update(user.tenantId, id, body);
      if (!item)
        return reply
          .code(404)
          .send({ success: false, error: { code: 'NOT_FOUND', message: 'Not found', requestId: request.id } });
      return reply.send({ success: true, data: item });
    }
  );

  app.delete(
    '/api/v1/import/mapping-templates/:id',
    { preHandler: requirePermission(PERMISSIONS.DATA.IMPORT) },
    async (request, reply) => {
      const { id } = IdParams.parse(request.params);
      const user = (request as any).user as { tenantId: string };
      const item = await service.remove(user.tenantId, id);
      if (!item)
        return reply
          .code(404)
          .send({ success: false, error: { code: 'NOT_FOUND', message: 'Not found', requestId: request.id } });
      return reply.send({ success: true, data: item });
    }
  );
}
