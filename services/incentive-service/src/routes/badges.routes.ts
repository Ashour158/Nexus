import type { FastifyInstance } from 'fastify';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { createBadgesService } from '../services/badges.service.js';

export async function registerBadgesRoutes(app: FastifyInstance, badges: ReturnType<typeof createBadgesService>): Promise<void> {
  app.get('/api/v1/badges', { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    return reply.send({ success: true, data: await badges.listBadges(tenantId) });
  });
  app.get('/api/v1/badges/mine', { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) }, async (request, reply) => {
    const user = (request as unknown as { user: { tenantId: string; sub: string } }).user;
    return reply.send({ success: true, data: await badges.getMyBadges(user.tenantId, user.sub) });
  });
}
