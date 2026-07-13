import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { TicketsService } from '../services/tickets.service.js';

const SUPPORT_LEVELS = ['BASIC', 'STANDARD', 'PREMIUM'] as const;

const Id = z.object({ id: z.string().min(1) });

// Accept ISO date strings on the wire; coerce to Date for the service layer.
const CreateBody = z.object({
  accountId: z.string().min(1),
  name: z.string().min(1),
  supportLevel: z.enum(SUPPORT_LEVELS).optional(),
  startAt: z.coerce.date().optional(),
  endAt: z.coerce.date().nullable().optional(),
  remainingUnits: z.number().int().min(0).nullable().optional(),
  isActive: z.boolean().optional(),
});

const PatchBody = z.object({
  name: z.string().min(1).optional(),
  supportLevel: z.enum(SUPPORT_LEVELS).optional(),
  startAt: z.coerce.date().optional(),
  endAt: z.coerce.date().nullable().optional(),
  remainingUnits: z.number().int().min(0).nullable().optional(),
  isActive: z.boolean().optional(),
});

const ListQuery = z.object({ accountId: z.string().optional() });
const CheckQuery = z.object({ accountId: z.string().min(1) });

function ctx(request: FastifyRequest) {
  return { tenantId: (request as unknown as { user: { tenantId: string } }).user.tenantId };
}

function notFound(reply: any, request: FastifyRequest) {
  return reply
    .code(404)
    .send({ success: false, error: { code: 'NOT_FOUND', message: 'Entitlement not found', requestId: request.id } });
}

export async function registerEntitlementRoutes(app: FastifyInstance, tickets: TicketsService) {
  const R = PERMISSIONS.TICKETS;

  app.get('/api/v1/entitlements', { preHandler: requirePermission(R.READ) }, async (request, reply) => {
    const { tenantId } = ctx(request);
    const { accountId } = ListQuery.parse(request.query);
    return reply.send({ success: true, data: await tickets.listEntitlements(tenantId, accountId) });
  });

  // Coverage check — registered before `/:id` so `check` is not read as an id.
  app.get('/api/v1/entitlements/check', { preHandler: requirePermission(R.READ) }, async (request, reply) => {
    const { tenantId } = ctx(request);
    const { accountId } = CheckQuery.parse(request.query);
    return reply.send({ success: true, data: await tickets.checkEntitlement(tenantId, accountId) });
  });

  app.get('/api/v1/entitlements/:id', { preHandler: requirePermission(R.READ) }, async (request, reply) => {
    const { tenantId } = ctx(request);
    const { id } = Id.parse(request.params);
    const data = await tickets.getEntitlement(tenantId, id);
    if (!data) return notFound(reply, request);
    return reply.send({ success: true, data });
  });

  app.post('/api/v1/entitlements', { preHandler: requirePermission(R.UPDATE) }, async (request, reply) => {
    const { tenantId } = ctx(request);
    const body = CreateBody.parse(request.body);
    const data = await tickets.createEntitlement(tenantId, body);
    return reply.code(201).send({ success: true, data });
  });

  app.patch('/api/v1/entitlements/:id', { preHandler: requirePermission(R.UPDATE) }, async (request, reply) => {
    const { tenantId } = ctx(request);
    const { id } = Id.parse(request.params);
    const body = PatchBody.parse(request.body);
    const data = await tickets.updateEntitlement(tenantId, id, body);
    if (!data) return notFound(reply, request);
    return reply.send({ success: true, data });
  });

  app.delete('/api/v1/entitlements/:id', { preHandler: requirePermission(R.DELETE) }, async (request, reply) => {
    const { tenantId } = ctx(request);
    const { id } = Id.parse(request.params);
    const ok = await tickets.deleteEntitlement(tenantId, id);
    if (!ok) return notFound(reply, request);
    return reply.send({ success: true, data: { id, deleted: true } });
  });
}
