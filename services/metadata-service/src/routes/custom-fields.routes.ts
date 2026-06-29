import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission, ValidationError } from '@nexus/service-utils';
import { CreateCustomFieldSchema, IdParamSchema, UpdateCustomFieldSchema } from '@nexus/validation';
import type { MetadataPrisma } from '../prisma.js';
import { createCustomFieldsService } from '../services/custom-fields.service.js';

export async function registerCustomFieldsRoutes(
  app: FastifyInstance,
  prisma: MetadataPrisma
): Promise<void> {
  const service = createCustomFieldsService(prisma);

  await app.register(
    async (r) => {
      r.get(
        '/custom-fields',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { entityType } = request.query as { entityType?: string };
          const rows = await service.listCustomFields(jwt.tenantId, entityType);
          return reply.send({ success: true, data: rows });
        }
      );

      r.post(
        '/custom-fields',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const parsed = CreateCustomFieldSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const row = await service.createCustomField(jwt.tenantId, parsed.data);
          return reply.code(201).send({ success: true, data: row });
        }
      );

      r.get(
        '/custom-fields/:id',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const row = await service.getCustomFieldById(jwt.tenantId, id);
          return reply.send({ success: true, data: row });
        }
      );

      r.patch(
        '/custom-fields/:id',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const parsed = UpdateCustomFieldSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const row = await service.updateCustomField(jwt.tenantId, id, parsed.data);
          return reply.send({ success: true, data: row });
        }
      );

      r.delete(
        '/custom-fields/:id',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          await service.deleteCustomField(jwt.tenantId, id);
          return reply.send({ success: true, data: { id, deleted: true } });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
