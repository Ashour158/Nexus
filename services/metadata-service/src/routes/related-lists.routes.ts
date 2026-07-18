import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission, ValidationError } from '@nexus/service-utils';
import { z } from 'zod';
import { IdParamSchema } from '@nexus/validation';
import type { MetadataPrisma } from '../prisma.js';
import { createRelatedListsService } from '../services/related-lists.service.js';

const CreateBody = z.object({
  module: z.string().min(1).max(60),
  name: z.string().min(1).max(120),
  relatedModule: z.string().min(1).max(60),
  displayFields: z.array(z.string()).max(100).optional(),
  sortBy: z.string().max(120).optional(),
  visibleToProfiles: z.array(z.string().min(1)).max(200).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});
const UpdateBody = CreateBody.partial().omit({ module: true });

export async function registerRelatedListsRoutes(app: FastifyInstance, prisma: MetadataPrisma): Promise<void> {
  const service = createRelatedListsService(prisma);

  await app.register(
    async (r) => {
      const READ = { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) };
      const WRITE = { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) };

      // GET /related-lists?module=account → ordered, profile-filtered set.
      r.get('/related-lists', READ, async (request, reply) => {
        const q = request.query as Record<string, string | undefined>;
        const jwt = request.user as JwtPayload;
        const data = await service.listConfigs(jwt.tenantId, {
          module: q.module,
          roles: jwt.roles ?? [],
          activeOnly: q.all === 'true' ? false : true,
        });
        return reply.send({ success: true, data });
      });
      r.post('/related-lists', WRITE, async (request, reply) => {
        const parsed = CreateBody.safeParse(request.body);
        if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
        const jwt = request.user as JwtPayload;
        return reply.code(201).send({ success: true, data: await service.createConfig(jwt.tenantId, parsed.data) });
      });
      r.get('/related-lists/:id', READ, async (request, reply) => {
        const { id } = IdParamSchema.parse(request.params);
        const jwt = request.user as JwtPayload;
        return reply.send({ success: true, data: await service.getConfig(jwt.tenantId, id) });
      });
      r.patch('/related-lists/:id', WRITE, async (request, reply) => {
        const { id } = IdParamSchema.parse(request.params);
        const parsed = UpdateBody.safeParse(request.body);
        if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
        const jwt = request.user as JwtPayload;
        return reply.send({ success: true, data: await service.updateConfig(jwt.tenantId, id, parsed.data) });
      });
      r.delete('/related-lists/:id', WRITE, async (request, reply) => {
        const { id } = IdParamSchema.parse(request.params);
        const jwt = request.user as JwtPayload;
        await service.deleteConfig(jwt.tenantId, id);
        return reply.send({ success: true, data: { id, deleted: true } });
      });
    },
    { prefix: '/api/v1' }
  );
}
