import type { FastifyInstance, FastifyRequest } from 'fastify';
import { NexusError, ValidationError } from '@nexus/service-utils';
import type { ClickHouseClient } from '@clickhouse/client';
import { createQueryAnalyticsService, QueryExecutionError } from '../services/query.analytics.js';
import { SpecError } from '../services/query.compiler.js';

/**
 * Internal (docker-network-only) analytics execution for callers that have no
 * end-user JWT — chiefly reporting-service's schedule runner, which renders a
 * saved BI report on a cron with nobody logged in.
 *
 * The shared `createService` bootstrap skips its global JWT preHandler for
 * `/api/v1/internal/*` requests carrying a valid `x-service-token`
 * (packages/service-utils/src/server.ts), so the check below is the
 * authoritative gate.
 */

/**
 * Gate for the internal routes — STRICT, unlike the permissive-when-unconfigured
 * variant other services use for their own internal routes.
 *
 * The difference matters: this route takes `tenantId` from the request BODY
 * rather than from a verified token, so it can read across tenants by design.
 * Permitting it when `INTERNAL_SERVICE_TOKEN` is unset would turn a missing env
 * var into an unauthenticated cross-tenant read. Fail closed instead.
 */
function verifyServiceToken(req: FastifyRequest): boolean {
  const expected = process.env.INTERNAL_SERVICE_TOKEN;
  if (!expected) return false;
  return req.headers['x-service-token'] === expected;
}

export async function registerInternalAnalyticsRoutes(app: FastifyInstance, clickhouse: ClickHouseClient) {
  const svc = createQueryAnalyticsService(clickhouse);

  await app.register(
    async (r) => {
      /**
       * Execute a ReportSpec on behalf of a named tenant.
       * Body: { tenantId, spec }
       */
      r.post('/internal/analytics/query', async (request, reply) => {
        if (!verifyServiceToken(request)) {
          throw new NexusError('UNAUTHORIZED', 'invalid service token', 401);
        }
        const body = (request.body ?? {}) as { tenantId?: unknown; spec?: unknown };
        if (typeof body.tenantId !== 'string' || body.tenantId.length === 0) {
          throw new ValidationError('tenantId is required');
        }
        try {
          const result = await svc.runReport(body.tenantId, body.spec ?? {});
          return reply.send({ success: true, data: result });
        } catch (err) {
          if (err instanceof SpecError) throw new ValidationError(err.message);
          if (err instanceof QueryExecutionError) {
            throw new NexusError('ANALYTICS_QUERY_FAILED', err.message, 502);
          }
          throw err;
        }
      });
    },
    { prefix: '/api/v1' }
  );
}
