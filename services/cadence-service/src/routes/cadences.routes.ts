import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { createCadencesService } from '../services/cadences.service.js';

const Id = z.object({ id: z.string().cuid() });
const CadenceSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  objectType: z.enum(['CONTACT', 'LEAD']),
  isActive: z.boolean().optional(),
  exitOnReply: z.boolean().optional(),
  exitOnMeeting: z.boolean().optional(),
  steps: z
    .array(
      z.object({
        position: z.number().int().min(0),
        type: z.enum(['EMAIL', 'CALL_TASK', 'LINKEDIN_TASK', 'SMS', 'WAIT']),
        delayDays: z.number().int().min(0).optional(),
        subject: z.string().optional(),
        body: z.string().optional(),
        taskTitle: z.string().optional(),
        variantB: z.record(z.unknown()).optional(),
      })
    )
    .default([]),
});

export async function registerCadencesRoutes(
  app: FastifyInstance,
  cadences: ReturnType<typeof createCadencesService>
) {
  app.get('/api/v1/cadences', { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const data = await cadences.listCadences(tenantId);
    return reply.send({ success: true, data });
  });

  app.post('/api/v1/cadences', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const body = CadenceSchema.parse(request.body);
    const data = await cadences.createCadence(tenantId, body);
    return reply.code(201).send({ success: true, data });
  });

  app.get('/api/v1/cadences/:id', { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const { id } = Id.parse(request.params);
    const data = await cadences.getCadence(tenantId, id);
    if (!data) return reply.code(404).send({ success: false, error: 'Not found' });
    return reply.send({ success: true, data });
  });

  app.patch('/api/v1/cadences/:id', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const { id } = Id.parse(request.params);
    const body = CadenceSchema.partial().parse(request.body);
    const data = await cadences.updateCadence(tenantId, id, body);
    if (!data) return reply.code(404).send({ success: false, error: 'Not found' });
    return reply.send({ success: true, data });
  });

  app.delete('/api/v1/cadences/:id', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const { id } = Id.parse(request.params);
    const data = await cadences.deleteCadence(tenantId, id);
    if (!data) return reply.code(404).send({ success: false, error: 'Not found' });
    return reply.send({ success: true, data });
  });

  app.get('/api/v1/cadences/:id/analytics', { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const { id } = Id.parse(request.params);
    const data = await cadences.getAnalytics(tenantId, id);
    return reply.send({ success: true, data });
  });
}
