import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission, ValidationError } from '@nexus/service-utils';
import {
  CreateGlobalPicklistSetSchema,
  IdParamSchema,
  UpdateGlobalPicklistSetSchema,
} from '@nexus/validation';
import type { MetadataPrisma } from '../prisma.js';
import { createGlobalSetsService } from '../services/global-sets.service.js';

/**
 * Global picklist sets: tenant-level named option lists that many custom fields
 * can share. CRUD is settings-gated exactly like custom-fields/custom-modules.
 */
export async function registerGlobalSetsRoutes(app: FastifyInstance, prisma: MetadataPrisma): Promise<void> {
  const service = createGlobalSetsService(prisma);

  await app.register(
    async (r) => {
      const READ = { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) };
      const WRITE = { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) };

      r.get('/global-sets', READ, async (request, reply) => {
        const jwt = request.user as JwtPayload;
        return reply.send({ success: true, data: await service.listSets(jwt.tenantId) });
      });

      r.post('/global-sets', WRITE, async (request, reply) => {
        const parsed = CreateGlobalPicklistSetSchema.safeParse(request.body);
        if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
        const jwt = request.user as JwtPayload;
        return reply.code(201).send({ success: true, data: await service.createSet(jwt.tenantId, parsed.data) });
      });

      r.get('/global-sets/:id', READ, async (request, reply) => {
        const { id } = IdParamSchema.parse(request.params);
        const jwt = request.user as JwtPayload;
        return reply.send({ success: true, data: await service.getSet(jwt.tenantId, id) });
      });

      r.patch('/global-sets/:id', WRITE, async (request, reply) => {
        const { id } = IdParamSchema.parse(request.params);
        const parsed = UpdateGlobalPicklistSetSchema.safeParse(request.body);
        if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
        const jwt = request.user as JwtPayload;
        return reply.send({ success: true, data: await service.updateSet(jwt.tenantId, id, parsed.data) });
      });

      r.delete('/global-sets/:id', WRITE, async (request, reply) => {
        const { id } = IdParamSchema.parse(request.params);
        const jwt = request.user as JwtPayload;
        await service.deleteSet(jwt.tenantId, id);
        return reply.send({ success: true, data: { id, deleted: true } });
      });
    },
    { prefix: '/api/v1' }
  );
}
