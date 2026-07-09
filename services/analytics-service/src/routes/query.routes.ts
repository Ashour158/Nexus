import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import { NexusError, PERMISSIONS, ValidationError, requirePermission } from '@nexus/service-utils';
import type { ClickHouseClient } from '@clickhouse/client';
import { createQueryAnalyticsService, QueryExecutionError } from '../services/query.analytics.js';
import {
  SpecError,
  describeDataset,
  describeAllDatasets,
  isDataset,
  type Measure,
  type TimeGrain,
  type Filter,
} from '../services/query.compiler.js';
import {
  runReportWithComparison,
  getTimeSeries,
  getInsights,
  SmartQueryError,
  type CompareRange,
} from '../services/smart.analytics.js';

/**
 * Flexible query execution engine for self-serve BI.
 *
 * POST /api/v1/analytics/query        — execute a whitelisted ReportSpec
 * GET  /api/v1/analytics/query/fields — list whitelisted fields for a dataset
 *
 * Fail-open: a bad spec → 422 (SpecError → ValidationError); a ClickHouse
 * failure → 502. Never fabricates rows.
 */
export async function registerQueryAnalyticsRoutes(
  app: FastifyInstance,
  clickhouse: ClickHouseClient
) {
  const svc = createQueryAnalyticsService(clickhouse);
  await app.register(
    async (r) => {
      r.post(
        '/analytics/query',
        { preHandler: requirePermission(PERMISSIONS.ANALYTICS.READ) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const body = (request.body ?? {}) as Record<string, unknown>;
          try {
            // Smart period-over-period: `compareToPrevious` + `range { field, from, to }`
            // returns current vs prior equal-length window with per-measure deltas.
            if (body.compareToPrevious) {
              const range = body.range as CompareRange | undefined;
              if (!range) throw new SpecError('compareToPrevious requires `range { field, from, to }`');
              const result = await runReportWithComparison(clickhouse, jwt.tenantId, body, range);
              return reply.send({ success: true, data: result });
            }
            const result = await svc.runReport(jwt.tenantId, body);
            return reply.send({ success: true, data: result });
          } catch (err) {
            if (err instanceof SpecError) {
              // 422 — invalid / non-whitelisted spec.
              throw new ValidationError(err.message);
            }
            if (err instanceof QueryExecutionError || err instanceof SmartQueryError) {
              // 502 — read-model unavailable; do not fabricate rows.
              throw new NexusError('ANALYTICS_QUERY_FAILED', err.message, 502);
            }
            throw err;
          }
        }
      );

      r.get(
        '/analytics/query/fields',
        { preHandler: requirePermission(PERMISSIONS.ANALYTICS.READ) },
        async (request, reply) => {
          const dataset = (request.query as { dataset?: string }).dataset;
          if (!isDataset(dataset)) {
            throw new ValidationError('unknown or missing dataset');
          }
          return reply.send({ success: true, data: describeDataset(dataset) });
        }
      );

      // Full dataset catalog for a dynamic report-builder UI: every dataset +
      // its measures / dimensions / filters / time fields.
      r.get(
        '/analytics/datasets',
        { preHandler: requirePermission(PERMISSIONS.ANALYTICS.READ) },
        async (_request, reply) => {
          return reply.send({ success: true, data: { datasets: describeAllDatasets() } });
        }
      );

      // Time-series: any measure bucketed by day/week/month for charting.
      // Body: { dataset, measure?, grain?, filters?, timeField? }. Fail-open.
      r.post(
        '/analytics/timeseries',
        { preHandler: requirePermission(PERMISSIONS.ANALYTICS.READ) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const body = (request.body ?? {}) as {
            dataset?: string;
            measure?: Measure;
            grain?: TimeGrain;
            filters?: Filter[];
            timeField?: string;
          };
          if (!isDataset(body.dataset)) throw new ValidationError('unknown or missing dataset');
          try {
            const result = await getTimeSeries(clickhouse, jwt.tenantId, {
              dataset: body.dataset,
              measure: body.measure,
              grain: body.grain,
              filters: body.filters,
              timeField: body.timeField,
            });
            return reply.send({ success: true, data: result });
          } catch (err) {
            if (err instanceof SpecError) throw new ValidationError(err.message);
            throw err;
          }
        }
      );

      // Smart insights: top movers (MoM), anomalies (z-score), trend direction.
      // GET /analytics/insights?dataset=&grain=&measureField=&measureAgg=&sigma=&topN=
      r.get(
        '/analytics/insights',
        { preHandler: requirePermission(PERMISSIONS.ANALYTICS.READ) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const q = request.query as {
            dataset?: string;
            grain?: TimeGrain;
            measureField?: string;
            measureAgg?: Measure['agg'];
            sigma?: string;
            topN?: string;
          };
          if (!isDataset(q.dataset)) throw new ValidationError('unknown or missing dataset');
          const measure: Measure | undefined =
            q.measureField && q.measureAgg ? { field: q.measureField, agg: q.measureAgg } : undefined;
          try {
            const result = await getInsights(clickhouse, jwt.tenantId, q.dataset, {
              grain: q.grain,
              measure,
              sigma: q.sigma !== undefined ? Number(q.sigma) : undefined,
              topN: q.topN !== undefined ? Number(q.topN) : undefined,
            });
            return reply.send({ success: true, data: result });
          } catch (err) {
            if (err instanceof SpecError) throw new ValidationError(err.message);
            throw err;
          }
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
