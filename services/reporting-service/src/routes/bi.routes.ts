/**
 * Self-serve BI — saved reports & dashboards CRUD (ReportSpec-based).
 *
 * Additive, tenant-scoped, permission-guarded. Stores ReportSpec DEFINITIONS;
 * analytics-service executes them. The "run" convenience validates the spec
 * then calls analytics-service (guarded / fail-open) and returns rows.
 *
 * Permissions: ANALYTICS.READ for reads, ANALYTICS.EXPORT for writes/run —
 * these are the closest BI/reporting grants exposed by @nexus/service-utils.
 */
import type { FastifyInstance } from 'fastify';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { JwtPayload } from '@nexus/shared-types';
import { Prisma } from '../../../../node_modules/.prisma/reporting-client/index.js';
import type { ReportingPrisma } from '../prisma.js';
import { validateReportSpec, isValidChartType } from '../lib/report-spec.js';
import { runReportSpec } from '../lib/analytics-client.js';

const READ = { preHandler: requirePermission(PERMISSIONS.ANALYTICS.READ) };
const WRITE = { preHandler: requirePermission(PERMISSIONS.ANALYTICS.EXPORT) };

function notFound(reply: any, requestId: unknown) {
  return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Not found', requestId } });
}

function unprocessable(reply: any, requestId: unknown, errors: string[]) {
  return reply
    .code(422)
    .send({ success: false, error: { code: 'INVALID_SPEC', message: 'Invalid ReportSpec', details: errors, requestId } });
}

export async function registerBiRoutes(app: FastifyInstance, prisma: ReportingPrisma): Promise<void> {
  // ─── Saved reports ─────────────────────────────────────────────────────────

  // List: own reports + tenant-shared reports.
  app.get('/api/v1/bi/reports', READ, async (req, reply) => {
    const jwt = (req as any).user as JwtPayload;
    const reports = await prisma.biSavedReport.findMany({
      where: {
        tenantId: jwt.tenantId,
        OR: [{ ownerId: jwt.sub }, { isShared: true }],
      },
      orderBy: { updatedAt: 'desc' },
      take: 500,
    });
    return reply.send({ success: true, data: reports });
  });

  app.get('/api/v1/bi/reports/:id', READ, async (req, reply) => {
    const jwt = (req as any).user as JwtPayload;
    const { id } = req.params as { id: string };
    const report = await prisma.biSavedReport.findFirst({
      where: { id, tenantId: jwt.tenantId, OR: [{ ownerId: jwt.sub }, { isShared: true }] },
    });
    if (!report) return notFound(reply, req.id);
    return reply.send({ success: true, data: report });
  });

  app.post('/api/v1/bi/reports', WRITE, async (req, reply) => {
    const jwt = (req as any).user as JwtPayload;
    const body = req.body as { name?: string; description?: string; spec?: unknown; isShared?: boolean };
    if (typeof body.name !== 'string' || body.name.trim().length === 0) {
      return unprocessable(reply, req.id, ['name is required']);
    }
    const validation = validateReportSpec(body.spec);
    if (!validation.valid) return unprocessable(reply, req.id, validation.errors);

    const report = await prisma.biSavedReport.create({
      data: {
        tenantId: jwt.tenantId,
        ownerId: jwt.sub,
        name: body.name,
        description: body.description,
        spec: validation.spec as unknown as Prisma.InputJsonValue,
        isShared: body.isShared ?? false,
      },
    });
    return reply.code(201).send({ success: true, data: report });
  });

  app.patch('/api/v1/bi/reports/:id', WRITE, async (req, reply) => {
    const jwt = (req as any).user as JwtPayload;
    const { id } = req.params as { id: string };
    const body = req.body as { name?: string; description?: string | null; spec?: unknown; isShared?: boolean };

    // Only the owner may mutate a report.
    const existing = await prisma.biSavedReport.findFirst({ where: { id, tenantId: jwt.tenantId, ownerId: jwt.sub } });
    if (!existing) return notFound(reply, req.id);

    let specJson: Prisma.InputJsonValue | undefined;
    if (body.spec !== undefined) {
      const validation = validateReportSpec(body.spec);
      if (!validation.valid) return unprocessable(reply, req.id, validation.errors);
      specJson = validation.spec as unknown as Prisma.InputJsonValue;
    }

    const report = await prisma.biSavedReport.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(specJson !== undefined ? { spec: specJson } : {}),
        ...(body.isShared !== undefined ? { isShared: body.isShared } : {}),
      },
    });
    return reply.send({ success: true, data: report });
  });

  app.delete('/api/v1/bi/reports/:id', WRITE, async (req, reply) => {
    const jwt = (req as any).user as JwtPayload;
    const { id } = req.params as { id: string };
    const result = await prisma.biSavedReport.deleteMany({ where: { id, tenantId: jwt.tenantId, ownerId: jwt.sub } });
    if (result.count === 0) return notFound(reply, req.id);
    return reply.send({ success: true });
  });

  // Run convenience: validate spec, then pass through to analytics-service.
  // Fail-open — if analytics is unavailable, return empty rows + analyticsAvailable=false.
  app.post('/api/v1/bi/reports/:id/run', WRITE, async (req, reply) => {
    const jwt = (req as any).user as JwtPayload;
    const { id } = req.params as { id: string };
    const report = await prisma.biSavedReport.findFirst({
      where: { id, tenantId: jwt.tenantId, OR: [{ ownerId: jwt.sub }, { isShared: true }] },
    });
    if (!report) return notFound(reply, req.id);

    const validation = validateReportSpec(report.spec);
    if (!validation.valid) return unprocessable(reply, req.id, validation.errors);

    const result = await runReportSpec(jwt.tenantId, validation.spec, req.headers.authorization);
    return reply.send({
      success: true,
      data: {
        rows: result?.rows ?? [],
        analyticsAvailable: result !== null,
      },
    });
  });

  // Run an ad-hoc spec without saving it.
  app.post('/api/v1/bi/reports/run', WRITE, async (req, reply) => {
    const jwt = (req as any).user as JwtPayload;
    const body = req.body as { spec?: unknown };
    const validation = validateReportSpec(body.spec);
    if (!validation.valid) return unprocessable(reply, req.id, validation.errors);

    const result = await runReportSpec(jwt.tenantId, validation.spec, req.headers.authorization);
    return reply.send({
      success: true,
      data: {
        rows: result?.rows ?? [],
        analyticsAvailable: result !== null,
      },
    });
  });

  // ─── Dashboards ──────────────────────────────────────────────────────────────

  // List: own dashboards + tenant-shared.
  app.get('/api/v1/bi/dashboards', READ, async (req, reply) => {
    const jwt = (req as any).user as JwtPayload;
    const dashboards = await prisma.biDashboard.findMany({
      where: { tenantId: jwt.tenantId, OR: [{ ownerId: jwt.sub }, { isShared: true }] },
      orderBy: { updatedAt: 'desc' },
      take: 500,
    });
    return reply.send({ success: true, data: dashboards });
  });

  // Get one, with its widgets.
  app.get('/api/v1/bi/dashboards/:id', READ, async (req, reply) => {
    const jwt = (req as any).user as JwtPayload;
    const { id } = req.params as { id: string };
    const dashboard = await prisma.biDashboard.findFirst({
      where: { id, tenantId: jwt.tenantId, OR: [{ ownerId: jwt.sub }, { isShared: true }] },
      include: { widgets: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!dashboard) return notFound(reply, req.id);
    return reply.send({ success: true, data: dashboard });
  });

  app.post('/api/v1/bi/dashboards', WRITE, async (req, reply) => {
    const jwt = (req as any).user as JwtPayload;
    const body = req.body as { name?: string; description?: string; isShared?: boolean; layout?: unknown };
    if (typeof body.name !== 'string' || body.name.trim().length === 0) {
      return unprocessable(reply, req.id, ['name is required']);
    }
    const dashboard = await prisma.biDashboard.create({
      data: {
        tenantId: jwt.tenantId,
        ownerId: jwt.sub,
        name: body.name,
        description: body.description,
        isShared: body.isShared ?? false,
        ...(body.layout !== undefined ? { layout: body.layout as Prisma.InputJsonValue } : {}),
      },
    });
    return reply.code(201).send({ success: true, data: dashboard });
  });

  app.patch('/api/v1/bi/dashboards/:id', WRITE, async (req, reply) => {
    const jwt = (req as any).user as JwtPayload;
    const { id } = req.params as { id: string };
    const body = req.body as { name?: string; description?: string | null; isShared?: boolean; layout?: unknown };

    const existing = await prisma.biDashboard.findFirst({ where: { id, tenantId: jwt.tenantId, ownerId: jwt.sub } });
    if (!existing) return notFound(reply, req.id);

    const dashboard = await prisma.biDashboard.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.isShared !== undefined ? { isShared: body.isShared } : {}),
        ...(body.layout !== undefined ? { layout: body.layout as Prisma.InputJsonValue } : {}),
      },
      include: { widgets: { orderBy: { sortOrder: 'asc' } } },
    });
    return reply.send({ success: true, data: dashboard });
  });

  app.delete('/api/v1/bi/dashboards/:id', WRITE, async (req, reply) => {
    const jwt = (req as any).user as JwtPayload;
    const { id } = req.params as { id: string };
    const result = await prisma.biDashboard.deleteMany({ where: { id, tenantId: jwt.tenantId, ownerId: jwt.sub } });
    if (result.count === 0) return notFound(reply, req.id);
    return reply.send({ success: true });
  });

  // ─── Dashboard widgets ───────────────────────────────────────────────────────

  // Owner-only helper: confirm the dashboard belongs to the caller.
  async function ownedDashboard(tenantId: string, ownerId: string, dashboardId: string) {
    return prisma.biDashboard.findFirst({ where: { id: dashboardId, tenantId, ownerId } });
  }

  app.post('/api/v1/bi/dashboards/:id/widgets', WRITE, async (req, reply) => {
    const jwt = (req as any).user as JwtPayload;
    const { id } = req.params as { id: string };
    const dash = await ownedDashboard(jwt.tenantId, jwt.sub, id);
    if (!dash) return notFound(reply, req.id);

    const body = req.body as {
      title?: string;
      chartType?: string;
      spec?: unknown;
      position?: unknown;
      sortOrder?: number;
    };
    if (typeof body.title !== 'string' || body.title.trim().length === 0) {
      return unprocessable(reply, req.id, ['title is required']);
    }
    if (!isValidChartType(body.chartType)) {
      return unprocessable(reply, req.id, ['chartType must be one of: bar, line, area, pie, table, kpi, funnel']);
    }
    const validation = validateReportSpec(body.spec);
    if (!validation.valid) return unprocessable(reply, req.id, validation.errors);

    const widget = await prisma.biDashboardWidget.create({
      data: {
        tenantId: jwt.tenantId,
        dashboardId: id,
        title: body.title,
        chartType: body.chartType,
        spec: validation.spec as unknown as Prisma.InputJsonValue,
        position: (body.position ?? {}) as Prisma.InputJsonValue,
        sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : 0,
      },
    });
    return reply.code(201).send({ success: true, data: widget });
  });

  app.patch('/api/v1/bi/dashboards/:id/widgets/:widgetId', WRITE, async (req, reply) => {
    const jwt = (req as any).user as JwtPayload;
    const { id, widgetId } = req.params as { id: string; widgetId: string };
    const dash = await ownedDashboard(jwt.tenantId, jwt.sub, id);
    if (!dash) return notFound(reply, req.id);

    const existing = await prisma.biDashboardWidget.findFirst({
      where: { id: widgetId, tenantId: jwt.tenantId, dashboardId: id },
    });
    if (!existing) return notFound(reply, req.id);

    const body = req.body as {
      title?: string;
      chartType?: string;
      spec?: unknown;
      position?: unknown;
      sortOrder?: number;
    };

    if (body.chartType !== undefined && !isValidChartType(body.chartType)) {
      return unprocessable(reply, req.id, ['chartType must be one of: bar, line, area, pie, table, kpi, funnel']);
    }
    let specJson: Prisma.InputJsonValue | undefined;
    if (body.spec !== undefined) {
      const validation = validateReportSpec(body.spec);
      if (!validation.valid) return unprocessable(reply, req.id, validation.errors);
      specJson = validation.spec as unknown as Prisma.InputJsonValue;
    }

    const widget = await prisma.biDashboardWidget.update({
      where: { id: widgetId },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.chartType !== undefined ? { chartType: body.chartType } : {}),
        ...(specJson !== undefined ? { spec: specJson } : {}),
        ...(body.position !== undefined ? { position: body.position as Prisma.InputJsonValue } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
      },
    });
    return reply.send({ success: true, data: widget });
  });

  app.delete('/api/v1/bi/dashboards/:id/widgets/:widgetId', WRITE, async (req, reply) => {
    const jwt = (req as any).user as JwtPayload;
    const { id, widgetId } = req.params as { id: string; widgetId: string };
    const dash = await ownedDashboard(jwt.tenantId, jwt.sub, id);
    if (!dash) return notFound(reply, req.id);

    const result = await prisma.biDashboardWidget.deleteMany({
      where: { id: widgetId, tenantId: jwt.tenantId, dashboardId: id },
    });
    if (result.count === 0) return notFound(reply, req.id);
    return reply.send({ success: true });
  });

  // Reorder widgets in one call.
  app.put('/api/v1/bi/dashboards/:id/widgets/reorder', WRITE, async (req, reply) => {
    const jwt = (req as any).user as JwtPayload;
    const { id } = req.params as { id: string };
    const dash = await ownedDashboard(jwt.tenantId, jwt.sub, id);
    if (!dash) return notFound(reply, req.id);

    const body = req.body as { order?: Array<{ id: string; sortOrder: number }> };
    if (!Array.isArray(body.order)) {
      return unprocessable(reply, req.id, ['order must be an array of { id, sortOrder }']);
    }

    await prisma.$transaction(
      body.order.map((item) =>
        prisma.biDashboardWidget.updateMany({
          where: { id: item.id, tenantId: jwt.tenantId, dashboardId: id },
          data: { sortOrder: item.sortOrder },
        })
      )
    );
    return reply.send({ success: true });
  });
}
