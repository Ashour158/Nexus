import type { FastifyInstance } from 'fastify';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { JwtPayload } from '@nexus/shared-types';
import { Prisma } from '../../../../node_modules/.prisma/planning-client/index.js';
import type { PlanningPrisma } from '../prisma.js';

export async function registerForecastOverrideRoutes(app: FastifyInstance, prisma: PlanningPrisma): Promise<void> {
  app.get('/api/v1/forecast-overrides', { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) }, async (request, reply) => {
    const jwt = (request as any).user as JwtPayload;
    const { periodKey, pipelineScope } = request.query as {
      periodKey?: string;
      pipelineScope?: string;
    };

    const overrides = await prisma.forecastOverride.findMany({
      where: {
        tenantId: jwt.tenantId,
        ...(periodKey ? { periodKey } : {}),
        ...(pipelineScope !== undefined ? { scopePipelineId: pipelineScope } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
    return reply.send({ success: true, data: overrides });
  });

  app.put('/api/v1/forecast-overrides', { preHandler: requirePermission(PERMISSIONS.SETTINGS.WRITE) }, async (request, reply) => {
    const jwt = (request as any).user as JwtPayload;
    const body = request.body as {
      periodKey: string;
      repId: string;
      managerId: string;
      overrideValue: number;
      note?: string;
      pipelineId?: string | null;
      originalValue: number;
    };

    const scopePipelineId =
      body.pipelineId === undefined || body.pipelineId === null ? '' : body.pipelineId;

    const ov = await prisma.forecastOverride.upsert({
      where: {
        tenantId_periodKey_repId_scopePipelineId: {
          tenantId: jwt.tenantId,
          periodKey: body.periodKey,
          repId: body.repId,
          scopePipelineId,
        },
      },
      create: {
        tenantId: jwt.tenantId,
        periodKey: body.periodKey,
        repId: body.repId,
        scopePipelineId,
        managerId: body.managerId,
        overrideValue: new Prisma.Decimal(body.overrideValue),
        originalValue: new Prisma.Decimal(body.originalValue),
        note: body.note,
      },
      update: {
        overrideValue: new Prisma.Decimal(body.overrideValue),
        note: body.note ?? null,
        managerId: body.managerId,
        originalValue: new Prisma.Decimal(body.originalValue),
      },
    });
    return reply.send({ success: true, data: ov });
  });

  app.delete('/api/v1/forecast-overrides/:id', { preHandler: requirePermission(PERMISSIONS.SETTINGS.WRITE) }, async (request, reply) => {
    const jwt = (request as any).user as JwtPayload;
    const { id } = request.params as { id: string };
    const existing = await prisma.forecastOverride.findFirst({
      where: { id, tenantId: jwt.tenantId },
    });
    if (!existing) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Not found', requestId: request.id } });
    await prisma.forecastOverride.delete({ where: { id } });
    return reply.send({ success: true });
  });

  app.get('/api/v1/forecast-overrides/team-summary', { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) }, async (request, reply) => {
    const jwt = (request as any).user as JwtPayload;
    const { periodKey } = request.query as { periodKey?: string };
    if (!periodKey) return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'periodKey required', requestId: request.id } });

    const crmBase = process.env.CRM_SERVICE_URL ?? 'http://localhost:3001';
    const qs = new URLSearchParams({
      periodKey,
    }).toString();
    let repForecasts: Array<{
      ownerId: string;
      ownerName: string;
      totalValue: number;
      weightedValue: number;
    }> = [];
    try {
      // Guard the whole cross-service call: a transport failure (e.g. CRM_SERVICE_URL
      // unset -> localhost refused) must degrade to empty reps, not 500 the endpoint.
      const crmRes = await fetch(`${crmBase}/api/v1/forecast/rep-summary?${qs}`, {
        headers: {
          authorization: request.headers.authorization ?? '',
          'x-tenant-id': jwt.tenantId,
        },
      });
      const crmBody = (await crmRes.json()) as {
        success?: boolean;
        data?: typeof repForecasts;
      };
      repForecasts = crmBody.data ?? [];
    } catch {
      repForecasts = [];
    }

    const overrides = await prisma.forecastOverride.findMany({
      where: { tenantId: jwt.tenantId, periodKey, scopePipelineId: '' },
    });
    const overrideMap = new Map(overrides.map((o) => [o.repId, o]));

    const reps = repForecasts.map((rep) => {
      const override = overrideMap.get(rep.ownerId);
      const repCommit = rep.weightedValue;
      return {
        repId: rep.ownerId,
        repName: rep.ownerName,
        repCommit,
        managerOverride: override ? Number(override.overrideValue) : null,
        finalForecast: override ? Number(override.overrideValue) : repCommit,
        overrideNote: override?.note ?? null,
        adjustmentDelta: override ? Number(override.overrideValue) - repCommit : 0,
      };
    });

    const totals = reps.reduce(
      (acc, r) => ({
        repTotal: acc.repTotal + r.repCommit,
        managerTotal: acc.managerTotal + r.finalForecast,
      }),
      { repTotal: 0, managerTotal: 0 }
    );

    return reply.send({ success: true, data: { reps, totals } });
  });
}
