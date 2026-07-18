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
  parentId: z.string().cuid().nullable().optional(),
  rules: z.array(z.object({ field: z.string(), operator: z.string(), value: z.string() })).default([]),
});
const MemberBody = z.object({
  userId: z.string().min(1),
  role: z.enum(['manager', 'member']).default('member'),
});
const MemberRoleBody = z.object({ role: z.enum(['manager', 'member']) });
const AssignBody = z.object({
  module: z.enum(['lead', 'deal', 'account']),
  recordData: z.record(z.unknown()),
});
const SummaryQuery = z.object({
  amounts: z
    .string()
    .optional()
    .transform((s) => {
      if (!s) return undefined;
      try {
        const parsed = JSON.parse(s);
        return parsed && typeof parsed === 'object' ? (parsed as Record<string, number>) : undefined;
      } catch {
        return undefined;
      }
    }),
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

/** Map parent-validation errors thrown by the service to HTTP responses. */
function mapParentError(
  err: unknown,
  requestId: string
): { code: number; body: unknown } | null {
  const msg = (err as Error)?.message;
  if (msg === 'PARENT_NOT_FOUND') {
    return { code: 400, body: { success: false, error: { code: 'PARENT_NOT_FOUND', message: 'Parent territory not found', requestId } } };
  }
  if (msg === 'PARENT_CYCLE') {
    return { code: 400, body: { success: false, error: { code: 'PARENT_CYCLE', message: 'Parent would create a cycle', requestId } } };
  }
  return null;
}

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
    try {
      const data = await territories.createTerritory(tenantId, body);
      await cache.del(`territories:${tenantId}`);
      return reply.code(201).send({ success: true, data });
    } catch (err) {
      const mapped = mapParentError(err, request.id);
      if (mapped) return reply.code(mapped.code).send(mapped.body);
      throw err;
    }
  });

  // Nested hierarchy (roll-up tree). Static path — Fastify's radix router
  // prioritises it over the parametric `/territories/:id`.
  app.get('/api/v1/territories/tree', { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    return reply.send({ success: true, data: await territories.getTree(tenantId) });
  });

  // Resolve the territory a record routes to (module + recordData → territoryId).
  app.post('/api/v1/territories/assign', { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const body = AssignBody.parse(request.body);
    const data = await territories.resolveTerritory(tenantId, body.module, body.recordData);
    return reply.send({ success: true, data });
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
    try {
      const data = await territories.updateTerritory(tenantId, id, body);
      if (!data) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Not found', requestId: request.id } });
      await cache.del(`territory:${tenantId}:${id}`);
      await cache.del(`territories:${tenantId}`);
      return reply.send({ success: true, data });
    } catch (err) {
      const mapped = mapParentError(err, request.id);
      if (mapped) return reply.code(mapped.code).send(mapped.body);
      throw err;
    }
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

  app.post('/api/v1/territories/:id/members', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const { id } = Id.parse(request.params);
    const body = MemberBody.parse(request.body);
    const data = await territories.addMember(tenantId, id, body);
    if (data === null) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Territory not found', requestId: request.id } });
    return reply.code(201).send({ success: true, data });
  });

  app.patch('/api/v1/territories/:id/members/:memberId', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const { id, memberId } = z.object({ id: z.string().cuid(), memberId: z.string().cuid() }).parse(request.params);
    const body = MemberRoleBody.parse(request.body);
    const data = await territories.updateMember(tenantId, id, memberId, body);
    if (data === null) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Member not found', requestId: request.id } });
    return reply.send({ success: true, data });
  });

  app.delete('/api/v1/territories/:id/members/:memberId', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const { id, memberId } = z.object({ id: z.string().cuid(), memberId: z.string().cuid() }).parse(request.params);
    return reply.send({ success: true, data: await territories.removeMember(tenantId, id, memberId) });
  });

  // Territory-scoped roll-up over the territory + its descendants.
  app.get('/api/v1/territories/:id/summary', { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const { id } = Id.parse(request.params);
    const { amounts } = SummaryQuery.parse(request.query);
    const data = await territories.getSummary(tenantId, id, amounts);
    if (data === null) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Territory not found', requestId: request.id } });
    return reply.send({ success: true, data });
  });
}
