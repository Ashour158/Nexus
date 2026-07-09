import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { createMembersService } from '../services/members.service.js';

const CampaignId = z.object({ id: z.string().cuid() });
const MemberParams = z.object({ id: z.string().cuid(), memberId: z.string().cuid() });

const MemberEntity = z.enum(['LEAD', 'CONTACT']);
const MemberItem = z.object({
  entityType: MemberEntity,
  entityId: z.string().min(1),
  email: z.string().email(),
});
const AddBody = z.object({ members: z.array(MemberItem).min(1).max(5000) });

const ListQuery = z.object({
  status: z.enum(['PENDING', 'SENT', 'OPENED', 'CLICKED', 'BOUNCED', 'UNSUBSCRIBED', 'CONVERTED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const tenantOf = (request: unknown) => (request as { user: { tenantId: string } }).user.tenantId;
const notFound = (reply: any, request: any) =>
  reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Not found', requestId: request.id } });

export async function registerMembersRoutes(
  app: FastifyInstance,
  members: ReturnType<typeof createMembersService>
) {
  app.get('/api/v1/campaigns/:id/members', { preHandler: requirePermission(PERMISSIONS.CAMPAIGNS.READ) }, async (request, reply) => {
    const { id } = CampaignId.parse(request.params);
    const q = ListQuery.parse(request.query);
    const data = await members.list(tenantOf(request), id, q.status, q.page, q.limit);
    return reply.send({ success: true, data: data.items, pagination: data.pagination });
  });

  app.post('/api/v1/campaigns/:id/members', { preHandler: requirePermission(PERMISSIONS.CAMPAIGNS.UPDATE) }, async (request, reply) => {
    const { id } = CampaignId.parse(request.params);
    const body = AddBody.parse(request.body);
    const result = await members.add(tenantOf(request), id, body.members);
    if ('error' in result) return notFound(reply, request);
    return reply.code(201).send({ success: true, data: result });
  });

  // Bulk import — same shape as add; kept as a distinct endpoint per spec.
  app.post('/api/v1/campaigns/:id/members/import', { preHandler: requirePermission(PERMISSIONS.CAMPAIGNS.UPDATE) }, async (request, reply) => {
    const { id } = CampaignId.parse(request.params);
    const body = AddBody.parse(request.body);
    const result = await members.add(tenantOf(request), id, body.members);
    if ('error' in result) return notFound(reply, request);
    return reply.code(201).send({ success: true, data: result });
  });

  app.delete('/api/v1/campaigns/:id/members/:memberId', { preHandler: requirePermission(PERMISSIONS.CAMPAIGNS.UPDATE) }, async (request, reply) => {
    const { id, memberId } = MemberParams.parse(request.params);
    const result = await members.remove(tenantOf(request), id, memberId);
    if ('error' in result) return notFound(reply, request);
    return reply.send({ success: true, data: result });
  });
}
