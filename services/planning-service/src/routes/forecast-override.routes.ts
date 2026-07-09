import type { FastifyInstance } from 'fastify';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { JwtPayload } from '@nexus/shared-types';
import { Prisma } from '../../../../node_modules/.prisma/planning-client/index.js';
import type { PlanningPrisma } from '../prisma.js';

const FETCH_TIMEOUT_MS = 5_000;

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
    // Accept BOTH the web contract ({ repId, periodKey, managerOverride, adjustedBy })
    // and the original service contract ({ overrideValue, managerId, originalValue }).
    const body = request.body as {
      periodKey: string;
      repId: string;
      managerId?: string;
      adjustedBy?: string;
      overrideValue?: number | null;
      managerOverride?: number | null;
      note?: string;
      pipelineId?: string | null;
      originalValue?: number;
    };

    if (!body?.periodKey || !body?.repId) {
      return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'periodKey and repId are required', requestId: request.id } });
    }

    const scopePipelineId =
      body.pipelineId === undefined || body.pipelineId === null ? '' : body.pipelineId;
    const managerId = body.managerId ?? body.adjustedBy ?? jwt.sub ?? '';
    // Field-name reconciliation: the web sends `managerOverride`, the original
    // API sends `overrideValue`. A null/omitted value means "clear the override".
    const rawOverride = body.managerOverride ?? body.overrideValue ?? null;

    const existing = await prisma.forecastOverride.findFirst({
      where: {
        tenantId: jwt.tenantId,
        periodKey: body.periodKey,
        repId: body.repId,
        scopePipelineId,
      },
    });

    // Clearing the override: delete the row (revert to the rep commit).
    if (rawOverride === null || rawOverride === undefined) {
      if (existing) await prisma.forecastOverride.delete({ where: { id: existing.id } });
      return reply.send({ success: true, data: null });
    }

    const overrideValue = new Prisma.Decimal(rawOverride);
    // originalValue is what the override replaced. Prefer an explicit value, else
    // keep what we already stored, else default to 0 (never throws on undefined).
    const originalValue = new Prisma.Decimal(
      body.originalValue ?? (existing ? Number(existing.originalValue) : 0)
    );

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
        managerId,
        overrideValue,
        originalValue,
        note: body.note,
      },
      update: {
        overrideValue,
        note: body.note ?? null,
        managerId,
        originalValue,
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
    const crmController = new AbortController();
    const crmTimer = setTimeout(() => crmController.abort(), FETCH_TIMEOUT_MS);
    try {
      // Guard the whole cross-service call: a transport failure (e.g. CRM_SERVICE_URL
      // unset -> localhost refused) or a hung peer must degrade to empty reps, not
      // hang/500 the endpoint.
      const crmRes = await fetch(`${crmBase}/api/v1/forecast/rep-summary?${qs}`, {
        headers: {
          authorization: request.headers.authorization ?? '',
          'x-tenant-id': jwt.tenantId,
        },
        signal: crmController.signal,
      });
      const crmBody = (await crmRes.json()) as {
        success?: boolean;
        data?: typeof repForecasts;
      };
      repForecasts = crmBody.data ?? [];
    } catch {
      repForecasts = [];
    } finally {
      clearTimeout(crmTimer);
    }

    const overrides = await prisma.forecastOverride.findMany({
      where: { tenantId: jwt.tenantId, periodKey, scopePipelineId: '' },
    });
    const overrideMap = new Map(overrides.map((o) => [o.repId, o]));

    // Quota attainment inputs: actuals (analytics closed-won by rep) vs quota
    // (planning QuotaTarget) for this period. Both fail-open to empty maps so a
    // downstream outage degrades attainment to 0, never 500s the endpoint.
    let year: number;
    let quarter: number | undefined;
    try {
      ({ year, quarter } = periodKeyToYearQuarter(periodKey));
    } catch {
      return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: `Unsupported periodKey: ${periodKey}`, requestId: request.id } });
    }
    const actualByRep = new Map<string, number>();
    const aController = new AbortController();
    const aTimer = setTimeout(() => aController.abort(), FETCH_TIMEOUT_MS);
    try {
      const analyticsBase = process.env.ANALYTICS_SERVICE_URL ?? 'http://localhost:3008';
      const aQs = new URLSearchParams({ year: String(year) });
      if (quarter) aQs.set('quarter', String(quarter));
      const aRes = await fetch(`${analyticsBase}/api/v1/analytics/revenue/by-rep?${aQs.toString()}`, {
        headers: {
          authorization: request.headers.authorization ?? '',
          'x-tenant-id': jwt.tenantId,
          'x-service-token': process.env.INTERNAL_SERVICE_TOKEN ?? '',
        },
        signal: aController.signal,
      });
      const aBody = (await aRes.json()) as {
        data?: Array<{ ownerId: string; totalRevenue: number | string }>;
      };
      for (const row of aBody.data ?? []) actualByRep.set(row.ownerId, Number(row.totalRevenue ?? 0));
    } catch {
      /* fail-open: no actuals */
    } finally {
      clearTimeout(aTimer);
    }

    const quotaByRep = new Map<string, number>();
    try {
      const plan = await prisma.quotaPlan.findFirst({
        where: { tenantId: jwt.tenantId, year, quarter: quarter ?? null, isActive: true },
        include: { targets: true },
        orderBy: { createdAt: 'desc' },
      });
      for (const t of plan?.targets ?? []) quotaByRep.set(t.ownerId, Number(t.targetValue));
    } catch {
      /* fail-open: no quota */
    }

    const reps = repForecasts.map((rep) => {
      const override = overrideMap.get(rep.ownerId);
      const repCommit = rep.weightedValue;
      const overrideValue = override ? Number(override.overrideValue) : null;
      const finalForecast = overrideValue ?? repCommit;
      const quota = quotaByRep.get(rep.ownerId) ?? 0;
      const actual = actualByRep.get(rep.ownerId) ?? 0;
      const attainment = quota > 0 ? Number(((actual / quota) * 100).toFixed(1)) : 0;
      return {
        repId: rep.ownerId,
        repName: rep.ownerName,
        // Original service fields (retained for back-compat).
        repCommit,
        managerOverride: overrideValue,
        finalForecast,
        overrideNote: override?.note ?? null,
        adjustmentDelta: overrideValue !== null ? overrideValue - repCommit : 0,
        // Web-contract field names (apps/web forecast/page.tsx reads these).
        weightedCommit: repCommit,
        override: overrideValue,
        attainment,
        quota,
        actual,
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

/** Map a period key ("2026-Q2" | "this_quarter" | "this_year" | …) to year+quarter.
 *  Throws on unsupported keys so a typo (e.g. "2026Q2") can't silently resolve to
 *  the current year and return misleading attainment. */
function periodKeyToYearQuarter(periodKey: string): { year: number; quarter?: number } {
  const key = periodKey.trim();
  const q = /^Q([1-4])-(\d{4})$/.exec(key);
  if (q) return { year: Number(q[2]), quarter: Number(q[1]) };
  const q2 = /^(\d{4})-Q([1-4])$/.exec(key);
  if (q2) return { year: Number(q2[1]), quarter: Number(q2[2]) };
  const year4 = /^(\d{4})$/.exec(key);
  if (year4) return { year: Number(year4[1]) };
  const now = new Date();
  const year = now.getUTCFullYear();
  if (key === 'this_quarter') return { year, quarter: Math.floor(now.getUTCMonth() / 3) + 1 };
  if (key === 'next_quarter') {
    const nq = Math.floor(now.getUTCMonth() / 3) + 2;
    return nq > 4 ? { year: year + 1, quarter: nq - 4 } : { year, quarter: nq };
  }
  if (key === 'this_month') return { year, quarter: Math.floor(now.getUTCMonth() / 3) + 1 };
  if (key === 'this_year') return { year };
  throw new Error(`Unsupported periodKey: ${JSON.stringify(periodKey)}`);
}
