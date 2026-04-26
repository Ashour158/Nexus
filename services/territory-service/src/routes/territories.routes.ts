import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { createTerritoriesService } from '../services/territories.service.js';

const Id = z.object({ id: z.string().cuid() });
const TerritoryBody = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  type: z.enum(['GEOGRAPHIC', 'INDUSTRY', 'ACCOUNT_SIZE', 'CUSTOM']),
  ownerIds: z.array(z.string().cuid()).default([]),
  teamId: z.string().optional(),
  priority: z.number().int().default(0),
  rules: z.array(z.object({ field: z.string(), operator: z.string(), value: z.string() })).default([]),
});
const Paging = z.object({
  leadId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function registerTerritoriesRoutes(
  app: FastifyInstance,
  territories: ReturnType<typeof createTerritoriesService>
) {
  app.get('/api/v1/territories', { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    return reply.send({ success: true, data: await territories.listTerritories(tenantId) });
  });

  app.post('/api/v1/territories', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const body = TerritoryBody.parse(request.body);
    return reply.code(201).send({ success: true, data: await territories.createTerritory(tenantId, body) });
  });

  app.get('/api/v1/territories/:id', { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const { id } = Id.parse(request.params);
    const data = await territories.getTerritory(tenantId, id);
    if (!data) return reply.code(404).send({ success: false, error: 'Not found' });
    return reply.send({ success: true, data });
  });

  app.patch('/api/v1/territories/:id', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const { id } = Id.parse(request.params);
    const body = TerritoryBody.partial().parse(request.body);
    const data = await territories.updateTerritory(tenantId, id, body);
    if (!data) return reply.code(404).send({ success: false, error: 'Not found' });
    return reply.send({ success: true, data });
  });

  app.delete('/api/v1/territories/:id', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const { id } = Id.parse(request.params);
    return reply.send({ success: true, data: await territories.deleteTerritory(tenantId, id) });
  });

  app.post('/api/v1/territories/test-assignment', { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const body = z.record(z.unknown()).parse(request.body);
    return reply.send({ success: true, data: await territories.testAssignment(tenantId, body) });
  });

  app.get('/api/v1/territories/routing-logs', { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const q = Paging.parse(request.query);
    return reply.send({ success: true, data: await territories.getRoutingLogs(tenantId, q.leadId, q.page, q.limit) });
  });
}
