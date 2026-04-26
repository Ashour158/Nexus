import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { createReportsService } from '../services/reports.service.js';

const ReportBody = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  category: z.string().min(1),
  datasource: z.string().min(1),
  querySpec: z.record(z.unknown()),
  isShared: z.boolean().optional(),
});
const ScheduleBody = z.object({
  cron: z.string().min(1),
  format: z.enum(['xlsx', 'csv']).default('xlsx'),
  recipients: z.array(z.string().email()).min(1),
});
const Id = z.object({ id: z.string().min(1) });

export async function registerReportsRoutes(
  app: FastifyInstance,
  reports: ReturnType<typeof createReportsService>
): Promise<void> {
  app.get('/api/v1/reports/templates', { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) }, async (request, reply) => {
    const query = z.object({ category: z.string().optional() }).parse(request.query);
    return reply.send({ success: true, data: reports.listTemplates(query.category) });
  });

  app.get('/api/v1/reports', { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const query = z.object({ category: z.string().optional() }).parse(request.query);
    return reply.send({ success: true, data: await reports.listCustomReports(tenantId, query.category) });
  });

  app.post('/api/v1/reports', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (request, reply) => {
    const user = (request as unknown as { user: { tenantId: string; sub: string } }).user;
    const body = ReportBody.parse(request.body);
    return reply.code(201).send({ success: true, data: await reports.saveReport(user.tenantId, user.sub, body) });
  });

  app.get('/api/v1/reports/:id', { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const { id } = Id.parse(request.params);
    const data = await reports.getReport(tenantId, id);
    if (!data) return reply.code(404).send({ success: false, error: 'Report not found' });
    return reply.send({ success: true, data });
  });

  app.delete('/api/v1/reports/:id', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const { id } = Id.parse(request.params);
    return reply.send({ success: true, data: await reports.deleteReport(tenantId, id) });
  });

  app.post('/api/v1/reports/:id/run', { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const { id } = Id.parse(request.params);
    const params = z.record(z.unknown()).default({}).parse(request.body ?? {});
    const data = await reports.runReport(tenantId, id, params);
    if (!data) return reply.code(404).send({ success: false, error: 'Report not found' });
    return reply.send({ success: true, data });
  });

  app.post('/api/v1/reports/:id/export', { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const { id } = Id.parse(request.params);
    const params = z.record(z.unknown()).default({}).parse(request.body ?? {});
    const data = await reports.exportXlsx(tenantId, id, params);
    if (!data) return reply.code(404).send({ success: false, error: 'Report not found' });
    return reply.header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(data);
  });

  app.get('/api/v1/reports/:id/schedules', { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const { id } = Id.parse(request.params);
    return reply.send({ success: true, data: await reports.listSchedules(tenantId, id) });
  });

  app.post('/api/v1/reports/:id/schedules', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const { id } = Id.parse(request.params);
    const body = ScheduleBody.parse(request.body);
    return reply.code(201).send({ success: true, data: await reports.createSchedule(tenantId, id, body) });
  });

  app.delete('/api/v1/reports/schedules/:id', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const { id } = Id.parse(request.params);
    return reply.send({ success: true, data: await reports.deleteSchedule(tenantId, id) });
  });
}
