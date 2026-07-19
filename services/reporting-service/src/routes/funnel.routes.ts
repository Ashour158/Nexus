import type { FastifyInstance } from 'fastify';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { JwtPayload } from '@nexus/shared-types';
import type { ReportingPrisma } from '../prisma.js';
import { buildFunnelReport } from '../lib/funnel-engine.js';
import { takeSnapshotNow } from '../lib/snapshot.job.js';
import {
  buildWinLossReport,
  dateRangeFromDays,
  fetchCanonicalDeals,
} from '../lib/canonical-deals.js';

// AUTHZ: match sibling bi.routes.ts — ANALYTICS.READ for reads, ANALYTICS.EXPORT
// for the snapshot-take write. Layers on top of the global jwtVerify preHandler.
const READ = { preHandler: requirePermission(PERMISSIONS.ANALYTICS.READ) };
const WRITE = { preHandler: requirePermission(PERMISSIONS.ANALYTICS.EXPORT) };

export async function registerFunnelRoutes(app: FastifyInstance, prisma: ReportingPrisma): Promise<void> {
  app.get('/api/v1/analytics/funnel', READ, async (req, reply) => {
    const jwt = (req as any).user as JwtPayload;
    const { from, to, pipelineId } = req.query as { from?: string; to?: string; pipelineId?: string };
    const fromDate = from ? new Date(from) : new Date(Date.now() - 90 * 86400000);
    const toDate = to ? new Date(to) : new Date();

    try {
      const report = await buildFunnelReport(prisma, jwt.tenantId, fromDate, toDate, pipelineId);
      return reply.send({ success: true, data: report });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Funnel failed';
      return reply.code(502).send({ success: false, error: { code: 'BAD_GATEWAY', message: 'Request failed', details: msg, requestId: req.id } });
    }
  });

  app.get('/api/v1/analytics/win-loss', READ, async (req, reply) => {
    const jwt = (req as any).user as JwtPayload;
    const { period, from, to } = req.query as {
      period?: string;
      from?: string;
      to?: string;
    };
    const defaults = dateRangeFromDays(Number(period ?? 90));
    const fromDate = from ? new Date(from) : defaults.from;
    const toDate = to ? new Date(to) : defaults.to;
    if (!Number.isFinite(fromDate.getTime()) || !Number.isFinite(toDate.getTime())) {
      return reply.code(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'from/to must be valid dates', requestId: req.id },
      });
    }
    try {
      const deals = await fetchCanonicalDeals(jwt.tenantId, { from: fromDate, to: toDate });
      return reply.send({
        success: true,
        data: buildWinLossReport(deals, fromDate, toDate),
      });
    } catch (e) {
      const details = e instanceof Error ? e.message : 'Win/loss failed';
      return reply.code(502).send({
        success: false,
        error: { code: 'BAD_GATEWAY', message: 'Request failed', details, requestId: req.id },
      });
    }
  });

  // Pipeline analytics page (/pipeline/analytics) reads funnel + stageDays from
  // this endpoint. Reuses the funnel engine; there was no route here before, so
  // the web /api/reports/pipeline proxy 404'd.
  app.get('/api/v1/reports/pipeline', READ, async (req, reply) => {
    const jwt = (req as any).user as JwtPayload;
    const { from, to, pipelineId } = req.query as { from?: string; to?: string; pipelineId?: string };
    const fromDate = from ? new Date(from) : new Date(Date.now() - 90 * 86400000);
    const toDate = to ? new Date(to) : new Date();
    try {
      const report = await buildFunnelReport(prisma, jwt.tenantId, fromDate, toDate, pipelineId);
      return reply.send({
        funnel: report.stages.map((s) => ({
          stage: s.stage,
          deals: s.count,
          value: s.totalValue,
          conversion: s.conversionRate,
        })),
        stageDays: report.stages.map((s) => ({ stage: s.stage, days: s.avgDaysInStage })),
        dealFlow: [],
        cohort: [],
        stats: {
          totalDeals: report.totalDeals,
          totalWon: report.totalWon,
          overallConversionRate: report.overallConversionRate,
          avgSalesCycledays: report.avgSalesCycledays,
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Pipeline report failed';
      return reply.code(502).send({ success: false, error: { code: 'BAD_GATEWAY', message: 'Request failed', details: msg, requestId: req.id } });
    }
  });

  app.get('/api/v1/analytics/snapshots', READ, async (req, reply) => {
    const jwt = (req as any).user as JwtPayload;
    const { from, to, pipelineId } = req.query as { from?: string; to?: string; pipelineId?: string };
    const fromDate = from ? new Date(from) : new Date(Date.now() - 90 * 86400000);
    const toDate = to ? new Date(to) : new Date();

    const snapshots = await prisma.pipelineSnapshot.findMany({
      where: {
        tenantId: jwt.tenantId,
        ...(pipelineId ? { pipelineId } : {}),
        snapshotDate: { gte: fromDate, lte: toDate },
      },
      orderBy: { snapshotDate: 'asc' },
    });
    return reply.send({ success: true, data: snapshots });
  });

  app.post('/api/v1/analytics/snapshots/take', WRITE, async (req, reply) => {
    const jwt = (req as any).user as JwtPayload;
    const { pipelineId } = (req.body as { pipelineId?: string }) ?? {};
    await takeSnapshotNow(prisma, jwt.tenantId, pipelineId);
    return reply.send({ success: true, message: 'Snapshot taken' });
  });

  app.get('/api/v1/analytics/cohort', READ, async (req, reply) => {
    const jwt = (req as any).user as JwtPayload;
    const { groupBy = 'ownerId', from, to } = req.query as { groupBy?: string; from?: string; to?: string };

    const crm = process.env.CRM_SERVICE_URL ?? 'http://localhost:3001';
    const qs = new URLSearchParams({ groupBy });
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    const res = await fetch(`${crm}/api/v1/internal/reporting/deals/cohort?${qs}`, {
      headers: {
        'x-service-token': process.env.INTERNAL_SERVICE_TOKEN ?? '',
        'x-tenant-id': jwt.tenantId,
      },
    });
    if (!res.ok) return reply.code(502).send({ success: false, error: { code: 'BAD_GATEWAY', message: 'CRM service error', requestId: req.id } });
    const raw = await res.json();
    return reply.send(raw);
  });
}
