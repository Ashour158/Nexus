import type { FastifyInstance } from 'fastify';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { JwtPayload } from '@nexus/shared-types';
import { Prisma } from '../../../../node_modules/.prisma/reporting-client/index.js';
import type { ReportingPrisma } from '../prisma.js';
import { executeReport, exportToCsv } from '../lib/report-engine.js';
import { createReportAuditLogger } from '../lib/audit-logger.js';

// AUTHZ: match sibling reports.routes.ts — SETTINGS.READ for reads/run/export,
// SETTINGS.UPDATE for mutations. Layers on top of the global jwtVerify preHandler.
const READ = { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) };
const WRITE = { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) };

export async function registerSavedReportsRoutes(app: FastifyInstance, prisma: ReportingPrisma): Promise<void> {
  const audit = createReportAuditLogger(prisma);
  app.get('/api/v1/saved-reports', READ, async (req, reply) => {
    const jwt = (req as any).user as JwtPayload;
    const { folderId, isShared } = req.query as { folderId?: string; isShared?: string };
    const reports = await prisma.savedReport.findMany({
      where: {
        tenantId: jwt.tenantId,
        ...(folderId ? { folderId } : {}),
        ...(isShared === 'true' ? { isShared: true } : {}),
      },
      orderBy: { updatedAt: 'desc' },
    });
    return reply.send({ success: true, data: reports });
  });

  app.get('/api/v1/saved-reports/:id', READ, async (req, reply) => {
    const jwt = (req as any).user as JwtPayload;
    const { id } = req.params as { id: string };
    const report = await prisma.savedReport.findFirst({ where: { id, tenantId: jwt.tenantId } });
    if (!report) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Not found', requestId: req.id } });
    return reply.send({ success: true, data: report });
  });

  app.post('/api/v1/saved-reports', WRITE, async (req, reply) => {
    const jwt = (req as any).user as JwtPayload;
    const body = req.body as {
      name: string;
      objectType: string;
      columns: string[];
      filters: unknown[];
      groupBy?: string;
      sortBy?: string;
      sortDir?: string;
      isShared?: boolean;
      folderId?: string;
      description?: string;
    };

    const report = await prisma.savedReport.create({
      data: {
        tenantId: jwt.tenantId,
        name: body.name,
        description: body.description,
        objectType: body.objectType,
        columns: body.columns as Prisma.InputJsonValue,
        filters: (body.filters ?? []) as Prisma.InputJsonValue,
        groupBy: body.groupBy,
        sortBy: body.sortBy ?? 'createdAt',
        sortDir: body.sortDir ?? 'desc',
        isShared: body.isShared ?? false,
        ownerId: jwt.sub,
        folderId: body.folderId,
      },
    });
    return reply.code(201).send({ success: true, data: report });
  });

  app.patch('/api/v1/saved-reports/:id', WRITE, async (req, reply) => {
    const jwt = (req as any).user as JwtPayload;
    const { id } = req.params as { id: string };
    const body = req.body as {
      name?: string;
      description?: string | null;
      columns?: string[];
      filters?: unknown[];
      groupBy?: string | null;
      sortBy?: string;
      sortDir?: string;
      isShared?: boolean;
      folderId?: string | null;
    };

    await prisma.savedReport.updateMany({
      where: { id, tenantId: jwt.tenantId },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.columns !== undefined ? { columns: body.columns as Prisma.InputJsonValue } : {}),
        ...(body.filters !== undefined ? { filters: body.filters as Prisma.InputJsonValue } : {}),
        ...(body.groupBy !== undefined ? { groupBy: body.groupBy } : {}),
        ...(body.sortBy !== undefined ? { sortBy: body.sortBy } : {}),
        ...(body.sortDir !== undefined ? { sortDir: body.sortDir } : {}),
        ...(body.isShared !== undefined ? { isShared: body.isShared } : {}),
        ...(body.folderId !== undefined ? { folderId: body.folderId } : {}),
      },
    });
    const report = await prisma.savedReport.findFirst({ where: { id, tenantId: jwt.tenantId } });
    return reply.send({ success: true, data: report });
  });

  app.delete('/api/v1/saved-reports/:id', WRITE, async (req, reply) => {
    const jwt = (req as any).user as JwtPayload;
    const { id } = req.params as { id: string };
    const existing = await prisma.savedReport.findFirst({ where: { id, tenantId: jwt.tenantId } });
    await prisma.savedReport.deleteMany({ where: { id, tenantId: jwt.tenantId } });
    if (existing) {
      audit
        .log({ tenantId: jwt.tenantId, userId: jwt.sub, action: 'report_deleted', reportId: id, reportName: existing.name })
        .catch((err) => app.log.warn({ err }, 'audit log failed'));
    }
    return reply.send({ success: true });
  });

  app.post('/api/v1/saved-reports/:id/run', READ, async (req, reply) => {
    const jwt = (req as any).user as JwtPayload;
    const auth = req.headers.authorization ?? '';
    const { id } = req.params as { id: string };
    const { limit = 500, offset = 0 } = req.query as { limit?: string; offset?: string };

    const report = await prisma.savedReport.findFirst({ where: { id, tenantId: jwt.tenantId } });
    if (!report) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Not found', requestId: req.id } });

    const result = await executeReport(prisma, jwt.tenantId, {
      objectType: report.objectType as 'deals',
      columns: report.columns as string[],
      filters: (report.filters as never) ?? [],
      groupBy: report.groupBy ?? undefined,
      sortBy: report.sortBy ?? undefined,
      sortDir: (report.sortDir ?? 'desc') as 'desc',
      limit: Number(limit),
      offset: Number(offset),
    }, { authorization: auth });

    audit
      .log({ tenantId: jwt.tenantId, userId: jwt.sub, action: 'report_executed', reportId: id, reportName: report.name })
      .catch((err) => app.log.warn({ err }, 'audit log failed'));

    return reply.send({ success: true, data: { rows: result.rows, total: result.total } });
  });

  app.get('/api/v1/saved-reports/:id/export', READ, async (req, reply) => {
    const jwt = (req as any).user as JwtPayload;
    const auth = req.headers.authorization ?? '';
    const { id } = req.params as { id: string };
    const report = await prisma.savedReport.findFirst({ where: { id, tenantId: jwt.tenantId } });
    if (!report) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Not found', requestId: req.id } });

    const result = await executeReport(prisma, jwt.tenantId, {
      objectType: report.objectType as 'deals',
      columns: report.columns as string[],
      filters: (report.filters as never) ?? [],
      limit: 10000,
      offset: 0,
    }, { authorization: auth });

    const csv = await exportToCsv(result.rows, report.columns as string[]);

    audit
      .log({ tenantId: jwt.tenantId, userId: jwt.sub, action: 'report_exported', reportId: id, reportName: report.name, format: 'csv' })
      .catch((err) => app.log.warn({ err }, 'audit log failed'));

    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', `attachment; filename="${report.name.replace(/\s+/g, '_')}.csv"`);
    return reply.send(csv);
  });

  app.post('/api/v1/saved-reports/run', READ, async (req, reply) => {
    const jwt = (req as any).user as JwtPayload;
    const auth = req.headers.authorization ?? '';
    const body = req.body as {
      objectType: string;
      columns: string[];
      filters?: unknown[];
      groupBy?: string;
      sortBy?: string;
      sortDir?: string;
      limit?: number;
      offset?: number;
    };
    const result = await executeReport(prisma, jwt.tenantId, {
      objectType: body.objectType as 'deals',
      columns: body.columns,
      filters: (body.filters ?? []) as never,
      groupBy: body.groupBy,
      sortBy: body.sortBy,
      sortDir: (body.sortDir ?? 'desc') as 'desc',
      limit: body.limit ?? 500,
      offset: body.offset ?? 0,
    }, { authorization: auth });
    return reply.send({ success: true, data: { rows: result.rows, total: result.total } });
  });

  app.get('/api/v1/report-folders', READ, async (req, reply) => {
    const jwt = (req as any).user as JwtPayload;
    const folders = await prisma.reportFolder.findMany({
      where: { tenantId: jwt.tenantId },
      include: { reports: { select: { id: true, name: true } } },
    });
    return reply.send({ success: true, data: folders });
  });

  app.post('/api/v1/report-folders', WRITE, async (req, reply) => {
    const jwt = (req as any).user as JwtPayload;
    const { name } = req.body as { name: string };
    const folder = await prisma.reportFolder.create({
      data: { tenantId: jwt.tenantId, name, ownerId: jwt.sub },
    });
    return reply.code(201).send({ success: true, data: folder });
  });

  app.get('/api/v1/saved-reports/:id/schedules', READ, async (req, reply) => {
    const jwt = (req as any).user as JwtPayload;
    const { id } = req.params as { id: string };
    const found = await prisma.savedReport.findFirst({
      where: { id, tenantId: jwt.tenantId },
    });
    if (!found) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Not found', requestId: req.id } });
    const schedules = await prisma.reportSchedule.findMany({
    take: 500, where: { reportId: id } });
    return reply.send({ success: true, data: schedules });
  });

  app.post('/api/v1/saved-reports/:id/schedules', WRITE, async (req, reply) => {
    const jwt = (req as any).user as JwtPayload;
    const { id } = req.params as { id: string };
    const existing = await prisma.savedReport.findFirst({
      where: { id, tenantId: jwt.tenantId },
    });
    if (!existing) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Not found', requestId: req.id } });

    const body = req.body as { cronExpr: string; recipients: string[]; format?: string; subject?: string };
    const nextRunAt = new Date();
    nextRunAt.setMinutes(nextRunAt.getMinutes() + 1);

    const schedule = await prisma.reportSchedule.create({
      data: {
        tenantId: jwt.tenantId,
        reportId: id,
        cron: body.cronExpr,
        recipients: body.recipients,
        format: body.format ?? 'csv',
        subject: body.subject,
        nextRunAt,
      },
    });
    audit
      .log({ tenantId: jwt.tenantId, userId: jwt.sub, action: 'report_scheduled', reportId: id, reportName: existing.name, format: body.format ?? 'csv' })
      .catch((err) => app.log.warn({ err }, 'audit log failed'));
    return reply.code(201).send({ success: true, data: schedule });
  });

  app.delete('/api/v1/saved-reports/schedules/:scheduleId', WRITE, async (req, reply) => {
    const jwt = (req as any).user as JwtPayload;
    const { scheduleId } = req.params as { scheduleId: string };
    await prisma.reportSchedule.deleteMany({
      where: { id: scheduleId, tenantId: jwt.tenantId },
    });
    return reply.send({ success: true });
  });
}
