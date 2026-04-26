import type { FastifyInstance } from 'fastify';
import { PERMISSIONS, ValidationError, requirePermission } from '@nexus/service-utils';
import {
  CreatePlaybookSchema,
  IdParamSchema,
  UpdatePlaybookSchema,
  UpsertPlaybookStageSchema,
} from '@nexus/validation';
import type { createPlaybooksService } from '../services/playbooks.service.js';

export async function registerPlaybooksRoutes(
  app: FastifyInstance,
  playbooks: ReturnType<typeof createPlaybooksService>
): Promise<void> {
  await app.register(
    async (r) => {
      r.get(
        '/blueprints/playbooks',
        { preHandler: requirePermission(PERMISSIONS.BLUEPRINTS.READ) },
        async (_request, reply) => {
          const rows = await playbooks.list();
          return reply.send({ success: true, data: rows });
        }
      );

      r.get(
        '/blueprints/playbooks/:id',
        { preHandler: requirePermission(PERMISSIONS.BLUEPRINTS.READ) },
        async (request, reply) => {
          const params = IdParamSchema.safeParse(request.params);
          if (!params.success) throw new ValidationError('Invalid params', params.error.flatten());
          const row = await playbooks.getById(params.data.id);
          return reply.send({ success: true, data: row });
        }
      );

      r.post(
        '/blueprints/playbooks',
        { preHandler: requirePermission(PERMISSIONS.BLUEPRINTS.MANAGE) },
        async (request, reply) => {
          const parsed = CreatePlaybookSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const row = await playbooks.create(parsed.data);
          return reply.code(201).send({ success: true, data: row });
        }
      );

      r.patch(
        '/blueprints/playbooks/:id',
        { preHandler: requirePermission(PERMISSIONS.BLUEPRINTS.MANAGE) },
        async (request, reply) => {
          const params = IdParamSchema.safeParse(request.params);
          if (!params.success) throw new ValidationError('Invalid params', params.error.flatten());
          const parsed = UpdatePlaybookSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const row = await playbooks.update(params.data.id, parsed.data);
          return reply.send({ success: true, data: row });
        }
      );

      r.delete(
        '/blueprints/playbooks/:id',
        { preHandler: requirePermission(PERMISSIONS.BLUEPRINTS.MANAGE) },
        async (request, reply) => {
          const params = IdParamSchema.safeParse(request.params);
          if (!params.success) throw new ValidationError('Invalid params', params.error.flatten());
          await playbooks.delete(params.data.id);
          return reply.code(204).send();
        }
      );

      r.put(
        '/blueprints/playbooks/:id/stages',
        { preHandler: requirePermission(PERMISSIONS.BLUEPRINTS.MANAGE) },
        async (request, reply) => {
          const params = IdParamSchema.safeParse(request.params);
          if (!params.success) throw new ValidationError('Invalid params', params.error.flatten());
          const parsed = UpsertPlaybookStageSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const row = await playbooks.upsertStage(params.data.id, parsed.data);
          return reply.send({ success: true, data: row });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
