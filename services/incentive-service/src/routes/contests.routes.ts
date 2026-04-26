import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { createContestsService } from '../services/contests.service.js';

export async function registerContestsRoutes(app: FastifyInstance, contests: ReturnType<typeof createContestsService>): Promise<void> {
  app.get('/api/v1/contests', { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    return reply.send({ success: true, data: await contests.listContests(tenantId) });
  });
  app.post('/api/v1/contests', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const body = z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      metric: z.enum(['DEALS_WON_COUNT', 'DEALS_WON_REVENUE', 'ACTIVITIES_COMPLETED', 'LEADS_CONVERTED', 'NEW_LOGOS']),
      targetValue: z.union([z.string(), z.number()]).optional(),
      startDate: z.string().datetime(),
      endDate: z.string().datetime(),
      prizeDescription: z.string().optional(),
    }).parse(request.body);
    return reply.code(201).send({ success: true, data: await contests.createContest(tenantId, body) });
  });
  app.get('/api/v1/contests/:id/leaderboard', { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const { id } = z.object({ id: z.string().cuid() }).parse(request.params);
    return reply.send({ success: true, data: await contests.getLeaderboard(tenantId, id) });
  });
}
