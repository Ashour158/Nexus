import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { createCampaignsService } from '../services/campaigns.service.js';

const Id = z.object({ id: z.string().cuid() });
const CampaignType = z.enum(['EMAIL', 'SOCIAL', 'EVENT', 'WEBINAR', 'PAID', 'OTHER']);
const CampaignStatus = z.enum(['DRAFT', 'SCHEDULED', 'RUNNING', 'PAUSED', 'COMPLETED', 'ARCHIVED']);

const ListQuery = z.object({
  type: CampaignType.optional(),
  status: CampaignStatus.optional(),
  ownerId: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const CreateBody = z.object({
  name: z.string().min(1),
  type: CampaignType.optional(),
  subject: z.string().optional(),
  fromName: z.string().optional(),
  fromEmail: z.string().email().optional(),
  contentHtml: z.string().optional(),
  templateId: z.string().optional(),
  scheduledAt: z.string().datetime().optional(),
  budget: z.number().nonnegative().optional(),
  ownerId: z.string().min(1),
  tags: z.array(z.string()).optional(),
  customFields: z.record(z.unknown()).optional(),
});

const UpdateBody = CreateBody.partial();
const StatusBody = z.object({ status: CampaignStatus });

const tenantOf = (request: unknown) => (request as { user: { tenantId: string } }).user.tenantId;
const notFound = (reply: any, request: any) =>
  reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Not found', requestId: request.id } });

export async function registerCampaignsRoutes(
  app: FastifyInstance,
  campaigns: ReturnType<typeof createCampaignsService>
) {
  app.get('/api/v1/campaigns', { preHandler: requirePermission(PERMISSIONS.CAMPAIGNS.READ) }, async (request, reply) => {
    const q = ListQuery.parse(request.query);
    const data = await campaigns.list(tenantOf(request), q);
    return reply.send({ success: true, data: data.items, pagination: data.pagination });
  });

  app.post('/api/v1/campaigns', { preHandler: requirePermission(PERMISSIONS.CAMPAIGNS.CREATE) }, async (request, reply) => {
    const body = CreateBody.parse(request.body);
    const data = await campaigns.create(tenantOf(request), body);
    return reply.code(201).send({ success: true, data });
  });

  app.get('/api/v1/campaigns/:id', { preHandler: requirePermission(PERMISSIONS.CAMPAIGNS.READ) }, async (request, reply) => {
    const { id } = Id.parse(request.params);
    const data = await campaigns.get(tenantOf(request), id);
    if (!data) return notFound(reply, request);
    return reply.send({ success: true, data });
  });

  app.patch('/api/v1/campaigns/:id', { preHandler: requirePermission(PERMISSIONS.CAMPAIGNS.UPDATE) }, async (request, reply) => {
    const { id } = Id.parse(request.params);
    const body = UpdateBody.parse(request.body);
    const data = await campaigns.update(tenantOf(request), id, body);
    if (!data) return notFound(reply, request);
    return reply.send({ success: true, data });
  });

  app.delete('/api/v1/campaigns/:id', { preHandler: requirePermission(PERMISSIONS.CAMPAIGNS.DELETE) }, async (request, reply) => {
    const { id } = Id.parse(request.params);
    const data = await campaigns.softDelete(tenantOf(request), id);
    if (!data) return notFound(reply, request);
    return reply.send({ success: true, data });
  });

  app.post('/api/v1/campaigns/:id/restore', { preHandler: requirePermission(PERMISSIONS.CAMPAIGNS.DELETE) }, async (request, reply) => {
    const { id } = Id.parse(request.params);
    const data = await campaigns.restore(tenantOf(request), id);
    if (!data) return notFound(reply, request);
    return reply.send({ success: true, data });
  });

  app.post('/api/v1/campaigns/:id/status', { preHandler: requirePermission(PERMISSIONS.CAMPAIGNS.UPDATE) }, async (request, reply) => {
    const { id } = Id.parse(request.params);
    const { status } = StatusBody.parse(request.body);
    const result = await campaigns.changeStatus(tenantOf(request), id, status);
    if ('error' in result) {
      if (result.error === 'NOT_FOUND') return notFound(reply, request);
      return reply.code(409).send({
        success: false,
        error: {
          code: 'INVALID_TRANSITION',
          message: `Cannot transition from ${result.from} to ${result.to}`,
          requestId: request.id,
        },
      });
    }
    return reply.send({ success: true, data: result.campaign });
  });

  app.post('/api/v1/campaigns/:id/send', { preHandler: requirePermission(PERMISSIONS.CAMPAIGNS.SEND) }, async (request, reply) => {
    const { id } = Id.parse(request.params);
    const result = await campaigns.send(tenantOf(request), id);
    if ('error' in result) {
      if (result.error === 'NOT_FOUND') return notFound(reply, request);
      return reply.code(409).send({
        success: false,
        error: {
          code: 'INVALID_TRANSITION',
          message: `Cannot send a campaign in state ${result.from}`,
          requestId: request.id,
        },
      });
    }
    return reply.send({ success: true, data: { campaign: result.campaign, requested: result.requested } });
  });
}
