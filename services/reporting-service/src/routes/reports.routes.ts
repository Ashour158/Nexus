import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { createReportsService } from '../services/reports.service.js';
import type { ReportingPrisma } from '../prisma.js';
import { createReportAuditLogger } from '../lib/audit-logger.js';

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
  reports: ReturnType<typeof createReportsService>,
  prisma: ReportingPrisma
): Promise<void> {
  const audit = createReportAuditLogger(prisma);
  app.get('/api/v1/reports/templates', { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) }, async (request, reply) => {
    const query = z.object({ category: z.string().optional() }).parse(request.query);
    return reply.send({ success: true, data: reports.listTemplates(query.category) });
  });

  app.get('/api/v1/report-definitions', { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const query = z.object({ category: z.string().optional() }).parse(request.query);
    return reply.send({ success: true, data: await reports.listCustomReports(tenantId, query.category) });
  });

  app.post('/api/v1/report-definitions', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (request, reply) => {
    const user = (request as unknown as { user: { tenantId: string; sub: string } }).user;
    const body = ReportBody.parse(request.body);
    return reply.code(201).send({ success: true, data: await reports.saveReport(user.tenantId, user.sub, body) });
  });

  app.get('/api/v1/report-definitions/:id', { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const { id } = Id.parse(request.params);
    const data = await reports.getReport(tenantId, id);
    if (!data) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Report not found', requestId: request.id } });
    return reply.send({ success: true, data });
  });

  app.delete('/api/v1/report-definitions/:id', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (request, reply) => {
    const user = (request as unknown as { user: { tenantId: string; sub: string } }).user;
    const { id } = Id.parse(request.params);
    const existing = await reports.getReport(user.tenantId, id);
    const data = await reports.deleteReport(user.tenantId, id);
    audit
      .log({ tenantId: user.tenantId, userId: user.sub, action: 'report_deleted', reportId: id, reportName: existing?.name ?? id })
      .catch((err) => app.log.warn({ err }, 'audit log failed'));
    return reply.send({ success: true, data });
  });

  app.post('/api/v1/report-definitions/:id/run', { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) }, async (request, reply) => {
    const user = (request as unknown as { user: { tenantId: string; sub: string } }).user;
    const { id } = Id.parse(request.params);
    const params = z.record(z.unknown()).default({}).parse(request.body ?? {});
    const data = await reports.runReport(user.tenantId, id, params);
    if (!data) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Report not found', requestId: request.id } });
    const report = await reports.getReport(user.tenantId, id);
    audit
      .log({ tenantId: user.tenantId, userId: user.sub, action: 'report_executed', reportId: id, reportName: report?.name ?? id })
      .catch((err) => app.log.warn({ err }, 'audit log failed'));
    return reply.send({ success: true, data });
  });

  app.post('/api/v1/report-definitions/:id/export', { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) }, async (request, reply) => {
    const user = (request as unknown as { user: { tenantId: string; sub: string } }).user;
    const { id } = Id.parse(request.params);
    const params = z.record(z.unknown()).default({}).parse(request.body ?? {});
    const data = await reports.exportXlsx(user.tenantId, id, params);
    if (!data) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Report not found', requestId: request.id } });
    const report = await reports.getReport(user.tenantId, id);
    audit
      .log({ tenantId: user.tenantId, userId: user.sub, action: 'report_exported', reportId: id, reportName: report?.name ?? id, format: 'xlsx' })
      .catch((err) => app.log.warn({ err }, 'audit log failed'));
    return reply.header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(data);
  });

  app.get('/api/v1/report-definitions/:id/schedules', { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const { id } = Id.parse(request.params);
    return reply.send({ success: true, data: await reports.listSchedules(tenantId, id) });
  });

  app.post('/api/v1/report-definitions/:id/schedules', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (request, reply) => {
    const user = (request as unknown as { user: { tenantId: string; sub: string } }).user;
    const { id } = Id.parse(request.params);
    const body = ScheduleBody.parse(request.body);
    const schedule = await reports.createSchedule(user.tenantId, id, body);
    const report = await reports.getReport(user.tenantId, id);
    audit
      .log({ tenantId: user.tenantId, userId: user.sub, action: 'report_scheduled', reportId: id, reportName: report?.name ?? id, format: body.format })
      .catch((err) => app.log.warn({ err }, 'audit log failed'));
    return reply.code(201).send({ success: true, data: schedule });
  });

  app.delete('/api/v1/report-definitions/schedules/:id', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const { id } = Id.parse(request.params);
    return reply.send({ success: true, data: await reports.deleteSchedule(tenantId, id) });
  });

  app.get('/api/v1/reports/performance', { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const data = await reports.getPerformanceReport(tenantId);
    return reply.send({ success: true, data });
  });

  app.get('/api/v1/reports/manager', { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const data = await reports.getManagerReport(tenantId);
    return reply.send({ success: true, data });
  });
}
