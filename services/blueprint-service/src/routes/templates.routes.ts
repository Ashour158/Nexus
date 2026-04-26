import type { FastifyInstance } from 'fastify';
import { PERMISSIONS, ValidationError, requirePermission } from '@nexus/service-utils';
import { CreateTemplateSchema, IdParamSchema, UpdateTemplateSchema } from '@nexus/validation';
import type { createTemplatesService } from '../services/templates.service.js';

export async function registerTemplatesRoutes(
  app: FastifyInstance,
  templates: ReturnType<typeof createTemplatesService>
): Promise<void> {
  await app.register(
    async (r) => {
      r.get(
        '/blueprints/templates',
        { preHandler: requirePermission(PERMISSIONS.BLUEPRINTS.READ) },
        async (_request, reply) => {
          const rows = await templates.list();
          return reply.send({ success: true, data: rows });
        }
      );

      r.get(
        '/blueprints/templates/:id',
        { preHandler: requirePermission(PERMISSIONS.BLUEPRINTS.READ) },
        async (request, reply) => {
          const params = IdParamSchema.safeParse(request.params);
          if (!params.success) throw new ValidationError('Invalid params', params.error.flatten());
          const row = await templates.getById(params.data.id);
          return reply.send({ success: true, data: row });
        }
      );

      r.post(
        '/blueprints/templates',
        { preHandler: requirePermission(PERMISSIONS.BLUEPRINTS.MANAGE) },
        async (request, reply) => {
          const parsed = CreateTemplateSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const row = await templates.create(parsed.data);
          return reply.code(201).send({ success: true, data: row });
        }
      );

      r.patch(
        '/blueprints/templates/:id',
        { preHandler: requirePermission(PERMISSIONS.BLUEPRINTS.MANAGE) },
        async (request, reply) => {
          const params = IdParamSchema.safeParse(request.params);
          if (!params.success) throw new ValidationError('Invalid params', params.error.flatten());
          const parsed = UpdateTemplateSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const row = await templates.update(params.data.id, parsed.data);
          return reply.send({ success: true, data: row });
        }
      );

      r.delete(
        '/blueprints/templates/:id',
        { preHandler: requirePermission(PERMISSIONS.BLUEPRINTS.MANAGE) },
        async (request, reply) => {
          const params = IdParamSchema.safeParse(request.params);
          if (!params.success) throw new ValidationError('Invalid params', params.error.flatten());
          await templates.delete(params.data.id);
          return reply.code(204).send();
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
