import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { TicketsService } from '../services/tickets.service.js';

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
const STATUSES = ['NEW', 'OPEN', 'PENDING', 'ON_HOLD', 'RESOLVED', 'CLOSED'] as const;
const CHANNELS = ['EMAIL', 'WEB', 'PHONE', 'CHAT', 'API'] as const;

const Id = z.object({ id: z.string().min(1) });

const ListQuery = z.object({
  status: z.enum(STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  assigneeId: z.string().optional(),
  accountId: z.string().optional(),
  requesterContactId: z.string().optional(),
  requesterEmail: z.string().optional(),
  teamId: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const CreateBody = z.object({
  subject: z.string().min(1),
  description: z.string().optional(),
  priority: z.enum(PRIORITIES).optional(),
  type: z.string().optional(),
  channel: z.enum(CHANNELS).optional(),
  requesterContactId: z.string().optional(),
  requesterEmail: z.string().email().optional(),
  accountId: z.string().optional(),
  assigneeId: z.string().optional(),
  teamId: z.string().optional(),
  tags: z.array(z.string()).optional(),
  customFields: z.record(z.unknown()).optional(),
});

const PatchBody = z.object({
  subject: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  priority: z.enum(PRIORITIES).optional(),
  type: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  customFields: z.record(z.unknown()).optional(),
  requesterContactId: z.string().nullable().optional(),
  requesterEmail: z.string().email().nullable().optional(),
  accountId: z.string().nullable().optional(),
});

const AssignBody = z
  .object({
    assigneeId: z.string().nullable().optional(),
    teamId: z.string().nullable().optional(),
  })
  // Presence (not truthiness) of a key is the signal: `{assigneeId: null}` or
  // `{assigneeId: ''}` explicitly unassigns; both keys absent is invalid.
  .refine((b) => 'assigneeId' in b || 'teamId' in b, {
    message: 'assigneeId or teamId is required',
  });

const TransitionBody = z.object({ status: z.enum(STATUSES) });

const SlaStatusQuery = z.object({
  status: z.enum(['at_risk', 'breached']),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

const CommentBody = z.object({
  body: z.string().min(1),
  isInternal: z.boolean().default(false),
});

function ctx(request: FastifyRequest) {
  const user = (request as unknown as { user: { tenantId: string; sub: string } }).user;
  return { tenantId: user.tenantId, actorId: user.sub };
}

function notFound(reply: any, request: FastifyRequest) {
  return reply
    .code(404)
    .send({ success: false, error: { code: 'NOT_FOUND', message: 'Ticket not found', requestId: request.id } });
}

export async function registerTicketRoutes(app: FastifyInstance, tickets: TicketsService) {
  const R = PERMISSIONS.TICKETS;

  app.get('/api/v1/tickets', { preHandler: requirePermission(R.READ) }, async (request, reply) => {
    const { tenantId } = ctx(request);
    const q = ListQuery.parse(request.query);
    const data = await tickets.listTickets(tenantId, q);
    return reply.send({ success: true, ...data });
  });

  app.post('/api/v1/tickets', { preHandler: requirePermission(R.CREATE) }, async (request, reply) => {
    const { tenantId, actorId } = ctx(request);
    const body = CreateBody.parse(request.body);
    const data = await tickets.createTicket(tenantId, actorId, body);
    return reply.code(201).send({ success: true, data });
  });

  // SLA queue view. Registered before `/:id` so `sla-status` is not captured as
  // a ticket id. `status`=at_risk|breached selects the queue.
  app.get('/api/v1/tickets/sla-status', { preHandler: requirePermission(R.READ) }, async (request, reply) => {
    const { tenantId } = ctx(request);
    const { status, limit } = SlaStatusQuery.parse(request.query);
    const data = await tickets.getSlaStatus(tenantId, status, limit);
    return reply.send({ success: true, data });
  });

  app.get('/api/v1/tickets/:id', { preHandler: requirePermission(R.READ) }, async (request, reply) => {
    const { tenantId } = ctx(request);
    const { id } = Id.parse(request.params);
    const data = await tickets.getTicket(tenantId, id);
    if (!data) return notFound(reply, request);
    return reply.send({ success: true, data });
  });

  app.patch('/api/v1/tickets/:id', { preHandler: requirePermission(R.UPDATE) }, async (request, reply) => {
    const { tenantId, actorId } = ctx(request);
    const { id } = Id.parse(request.params);
    const body = PatchBody.parse(request.body);
    const data = await tickets.updateTicket(tenantId, id, actorId, body);
    if (!data) return notFound(reply, request);
    return reply.send({ success: true, data });
  });

  app.delete('/api/v1/tickets/:id', { preHandler: requirePermission(R.DELETE) }, async (request, reply) => {
    const { tenantId, actorId } = ctx(request);
    const { id } = Id.parse(request.params);
    const ok = await tickets.softDelete(tenantId, id, actorId);
    if (!ok) return notFound(reply, request);
    return reply.send({ success: true, data: { id, deleted: true } });
  });

  app.post('/api/v1/tickets/:id/restore', { preHandler: requirePermission(R.UPDATE) }, async (request, reply) => {
    const { tenantId, actorId } = ctx(request);
    const { id } = Id.parse(request.params);
    const ok = await tickets.restore(tenantId, id, actorId);
    if (!ok) return notFound(reply, request);
    return reply.send({ success: true, data: { id, restored: true } });
  });

  app.post('/api/v1/tickets/:id/assign', { preHandler: requirePermission(R.ASSIGN) }, async (request, reply) => {
    const { tenantId, actorId } = ctx(request);
    const { id } = Id.parse(request.params);
    const body = AssignBody.parse(request.body);
    const data = await tickets.assign(tenantId, id, actorId, body);
    if (!data) return notFound(reply, request);
    return reply.send({ success: true, data });
  });

  app.post('/api/v1/tickets/:id/transition', { preHandler: requirePermission(R.UPDATE) }, async (request, reply) => {
    const { tenantId, actorId } = ctx(request);
    const { id } = Id.parse(request.params);
    const { status } = TransitionBody.parse(request.body);
    const data = await tickets.transition(tenantId, id, actorId, status);
    if (!data) return notFound(reply, request);
    return reply.send({ success: true, data });
  });

  app.get('/api/v1/tickets/:id/comments', { preHandler: requirePermission(R.READ) }, async (request, reply) => {
    const { tenantId } = ctx(request);
    const { id } = Id.parse(request.params);
    // Internal notes are only returned to users who can update tickets (agents).
    const user = (request as unknown as { user: { permissions?: string[] } }).user;
    const canSeeInternal =
      (user.permissions ?? []).includes('*') ||
      (user.permissions ?? []).includes(R.UPDATE) ||
      (user.permissions ?? []).includes('tickets:*');
    const data = await tickets.listComments(tenantId, id, canSeeInternal);
    if (data === null) return notFound(reply, request);
    return reply.send({ success: true, data });
  });

  app.post('/api/v1/tickets/:id/comments', { preHandler: requirePermission(R.UPDATE) }, async (request, reply) => {
    const { tenantId, actorId } = ctx(request);
    const { id } = Id.parse(request.params);
    const body = CommentBody.parse(request.body);
    const data = await tickets.addComment(tenantId, id, actorId, body.body, body.isInternal);
    if (data === null) return notFound(reply, request);
    return reply.code(201).send({ success: true, data });
  });

  app.get('/api/v1/tickets/:id/history', { preHandler: requirePermission(R.READ) }, async (request, reply) => {
    const { tenantId } = ctx(request);
    const { id } = Id.parse(request.params);
    const data = await tickets.listHistory(tenantId, id);
    if (data === null) return notFound(reply, request);
    return reply.send({ success: true, data });
  });
}
