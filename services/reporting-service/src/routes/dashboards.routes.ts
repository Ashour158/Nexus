import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import { Prisma } from '../../../../node_modules/.prisma/reporting-client/index.js';
import type { ReportingPrisma } from '../prisma.js';

export async function registerDashboardsRoutes(app: FastifyInstance, prisma: ReportingPrisma): Promise<void> {
  app.get('/api/v1/dashboards', async (req, reply) => {
    const jwt = (req as any).user as JwtPayload;
    const dashboards = await prisma.dashboard.findMany({
      where: { tenantId: jwt.tenantId },
      include: { widgets: { orderBy: { position: 'asc' } } },
      orderBy: [{ isPinned: 'desc' }, { updatedAt: 'desc' }],
    });
    return reply.send({ success: true, data: dashboards });
  });

  app.get('/api/v1/dashboards/:id', async (req, reply) => {
    const jwt = (req as any).user as JwtPayload;
    const { id } = req.params as { id: string };
    const dashboard = await prisma.dashboard.findFirst({
      where: { id, tenantId: jwt.tenantId },
      include: { widgets: { orderBy: { position: 'asc' } } },
    });
    if (!dashboard) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Not found', requestId: req.id } });
    return reply.send({ success: true, data: dashboard });
  });

  app.post('/api/v1/dashboards', async (req, reply) => {
    const jwt = (req as any).user as JwtPayload;
    const body = req.body as { name: string; isShared?: boolean };
    const dashboard = await prisma.dashboard.create({
      data: {
        tenantId: jwt.tenantId,
        name: body.name,
        ownerId: jwt.sub,
        isShared: body.isShared ?? false,
      },
    });
    return reply.code(201).send({ success: true, data: dashboard });
  });

  app.patch('/api/v1/dashboards/:id', async (req, reply) => {
    const jwt = (req as any).user as JwtPayload;
    const { id } = req.params as { id: string };
    const body = req.body as { name?: string; isPinned?: boolean; isShared?: boolean };

    await prisma.dashboard.updateMany({
      where: { id, tenantId: jwt.tenantId },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.isPinned !== undefined ? { isPinned: body.isPinned } : {}),
        ...(body.isShared !== undefined ? { isShared: body.isShared } : {}),
      },
    });

    const updated = await prisma.dashboard.findFirst({
      where: { id, tenantId: jwt.tenantId },
      include: { widgets: true },
    });
    return reply.send({ success: true, data: updated });
  });

  app.delete('/api/v1/dashboards/:id', async (req, reply) => {
    const jwt = (req as any).user as JwtPayload;
    const { id } = req.params as { id: string };
    await prisma.dashboard.deleteMany({ where: { id, tenantId: jwt.tenantId } });
    return reply.send({ success: true });
  });

  app.post('/api/v1/dashboards/:id/widgets', async (req, reply) => {
    const jwt = (req as any).user as JwtPayload;
    const { id } = req.params as { id: string };
    const dash = await prisma.dashboard.findFirst({
      where: { id, tenantId: jwt.tenantId },
    });
    if (!dash) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Not found', requestId: req.id } });
    const body = req.body as {
      type: string;
      title: string;
      config: unknown;
      reportId?: string;
      position?: number;
      width?: number;
      height?: number;
    };
    const widget = await prisma.dashboardWidget.create({
      data: {
        dashboardId: id,
        type: body.type,
        title: body.title,
        config: (body.config ?? {}) as Prisma.InputJsonValue,
        reportId: body.reportId,
        position: body.position ?? 0,
        width: body.width ?? 6,
        height: body.height ?? 4,
      },
    });
    return reply.code(201).send({ success: true, data: widget });
  });

  app.patch('/api/v1/dashboards/widgets/:widgetId', async (req, reply) => {
    const jwt = (req as any).user as JwtPayload;
    const { widgetId } = req.params as { widgetId: string };
    const existing = await prisma.dashboardWidget.findFirst({
      where: { id: widgetId },
      include: { dashboard: true },
    });
    if (!existing || existing.dashboard.tenantId !== jwt.tenantId) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Not found', requestId: req.id } });
    }
    const body = req.body as Record<string, unknown>;
    const widget = await prisma.dashboardWidget.update({
      where: { id: widgetId },
      data: body,
    });
    return reply.send({ success: true, data: widget });
  });

  app.delete('/api/v1/dashboards/widgets/:widgetId', async (req, reply) => {
    const jwt = (req as any).user as JwtPayload;
    const { widgetId } = req.params as { widgetId: string };
    const existing = await prisma.dashboardWidget.findFirst({
      where: { id: widgetId },
      include: { dashboard: true },
    });
    if (!existing || existing.dashboard.tenantId !== jwt.tenantId) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Not found', requestId: req.id } });
    }
    await prisma.dashboardWidget.delete({ where: { id: widgetId } });
    return reply.send({ success: true });
  });

  app.put('/api/v1/dashboards/:id/widgets/reorder', async (req, reply) => {
    const jwt = (req as any).user as JwtPayload;
    const { id } = req.params as { id: string };
    const dash = await prisma.dashboard.findFirst({
      where: { id, tenantId: jwt.tenantId },
    });
    if (!dash) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Not found', requestId: req.id } });

    const body = req.body as {
      order: Array<{ id: string; position: number; width?: number; height?: number }>;
    };
    await Promise.all(
      body.order.map((item) =>
        prisma.dashboardWidget.update({
          where: { id: item.id },
          data: {
            position: item.position,
            ...(item.width !== undefined ? { width: item.width } : {}),
            ...(item.height !== undefined ? { height: item.height } : {}),
          },
        })
      )
    );
    return reply.send({ success: true });
  });
}
