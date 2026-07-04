import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import { NexusError, PERMISSIONS, ValidationError, requirePermission } from '@nexus/service-utils';
import type { ClickHouseClient } from '@clickhouse/client';
import { createQueryAnalyticsService, QueryExecutionError } from '../services/query.analytics.js';
import { SpecError, describeDataset, isDataset } from '../services/query.compiler.js';

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
          try {
            const result = await svc.runReport(jwt.tenantId, request.body);
            return reply.send({ success: true, data: result });
          } catch (err) {
            if (err instanceof SpecError) {
              // 422 — invalid / non-whitelisted spec.
              throw new ValidationError(err.message);
            }
            if (err instanceof QueryExecutionError) {
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
            throw new ValidationError(
              `unknown or missing dataset; expected one of deals, leads, activities, revenue, quotes`
            );
          }
          return reply.send({ success: true, data: describeDataset(dataset) });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
