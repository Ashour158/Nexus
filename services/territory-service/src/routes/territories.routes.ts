import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { createTerritoriesService } from '../services/territories.service.js';
import { NexusCache } from '@nexus/cache';

const Id = z.object({ id: z.string().cuid() });
const TerritoryBody = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  type: z.enum(['GEOGRAPHIC', 'INDUSTRY', 'ACCOUNT_SIZE', 'CUSTOM']),
  ownerIds: z.array(z.string().cuid()).default([]),
  teamId: z.string().optional(),
  priority: z.number().int().default(0),
  isDefault: z.boolean().default(false),
  rules: z.array(z.object({ field: z.string(), operator: z.string(), value: z.string() })).default([]),
});
const Paging = z.object({
  leadId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
const AssignmentRuleBody = z.object({
  name: z.string().min(1),
  entityType: z.enum(['lead', 'deal', 'any']).default('lead'),
  criteria: z.record(z.unknown()).default({}),
  ownerId: z.string().nullable().optional(),
  queue: z.string().nullable().optional(),
  priority: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

export async function registerTerritoriesRoutes(
  app: FastifyInstance,
  territories: ReturnType<typeof createTerritoriesService>
) {
  const cache = new NexusCache();

  app.get('/api/v1/territories', { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const cacheKey = `territories:${tenantId}`;
    const data = await cache.cacheAside(
      cacheKey,
      () => territories.listTerritories(tenantId),
      300_000
    );
    return reply.send({ success: true, data });
  });

  app.post('/api/v1/territories', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const body = TerritoryBody.parse(request.body);
    const data = await territories.createTerritory(tenantId, body);
    await cache.del(`territories:${tenantId}`);
    return reply.code(201).send({ success: true, data });
  });

  app.get('/api/v1/territories/:id', { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const { id } = Id.parse(request.params);
    const cacheKey = `territory:${tenantId}:${id}`;
    const data = await cache.cacheAside(
      cacheKey,
      () => territories.getTerritory(tenantId, id),
      300_000
    );
    if (!data) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Not found', requestId: request.id } });
    return reply.send({ success: true, data });
  });

  app.patch('/api/v1/territories/:id', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const { id } = Id.parse(request.params);
    const body = TerritoryBody.partial().parse(request.body);
    const data = await territories.updateTerritory(tenantId, id, body);
    if (!data) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Not found', requestId: request.id } });
    await cache.del(`territory:${tenantId}:${id}`);
    await cache.del(`territories:${tenantId}`);
    return reply.send({ success: true, data });
  });

  app.delete('/api/v1/territories/:id', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const { id } = Id.parse(request.params);
    const result = await territories.deleteTerritory(tenantId, id);
    await cache.del(`territory:${tenantId}:${id}`);
    await cache.del(`territories:${tenantId}`);
    return reply.send({ success: true, data: result });
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

  // ─── B6: assignment rules (criteria-JSON) + members ─────────────────────────
  app.get('/api/v1/territories/:id/rules', { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const { id } = Id.parse(request.params);
    const data = await territories.listAssignmentRules(tenantId, id);
    if (data === null) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Territory not found', requestId: request.id } });
    return reply.send({ success: true, data });
  });

  app.post('/api/v1/territories/:id/rules', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const { id } = Id.parse(request.params);
    const body = AssignmentRuleBody.parse(request.body);
    const data = await territories.createAssignmentRule(tenantId, id, body);
    if (data === null) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Territory not found', requestId: request.id } });
    return reply.code(201).send({ success: true, data });
  });

  app.delete('/api/v1/territories/:id/rules/:ruleId', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const { ruleId } = z.object({ id: z.string().cuid(), ruleId: z.string().cuid() }).parse(request.params);
    return reply.send({ success: true, data: await territories.deleteAssignmentRule(tenantId, ruleId) });
  });

  app.get('/api/v1/territories/:id/members', { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const { id } = Id.parse(request.params);
    const data = await territories.getMembers(tenantId, id);
    if (data === null) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Territory not found', requestId: request.id } });
    return reply.send({ success: true, data });
  });
}
