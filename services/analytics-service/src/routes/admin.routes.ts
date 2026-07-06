import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { ClickHouseClient } from '@clickhouse/client';
import { ratesService } from '../services/rates.service.js';

/**
 * Admin backfill for the ClickHouse analytics read-model.
 *
 * The self-serve BI query engine reads `deal_events` (populated live by the
 * Kafka consumer). Deals created before the consumer's offset — e.g. an initial
 * data seed — never land there, so the report builder runs empty. This endpoint
 * rebuilds `deal_events` for the caller's tenant from crm-service's current deal
 * table (one synthetic `deal.created` row per deal), making the builder show real
 * numbers without a full event replay.
 *
 * POST /api/v1/analytics/admin/rebuild?dataset=deals
 */
export async function registerAdminRoutes(app: FastifyInstance, clickhouse: ClickHouseClient) {
  const CRM_URL = process.env.CRM_SERVICE_URL ?? 'http://crm-service:3001';
  const SERVICE_TOKEN = process.env.INTERNAL_SERVICE_TOKEN ?? '';

  await app.register(
    async (r) => {
      r.post(
        '/analytics/admin/rebuild',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const tenantId = jwt.tenantId;

          // 1. Pull current deals from crm (service-to-service).
          const res = await fetch(`${CRM_URL}/api/v1/internal/reporting/deals?limit=5000`, {
            headers: { 'x-service-token': SERVICE_TOKEN, 'x-tenant-id': tenantId },
          });
          if (!res.ok) {
            return reply.code(502).send({
              success: false,
              error: { code: 'CRM_UNAVAILABLE', message: `crm reporting returned ${res.status}`, requestId: request.id },
            });
          }
          const body = (await res.json()) as {
            data?: Array<{
              id: string;
              ownerId?: string;
              accountId?: string;
              pipelineId?: string;
              stageId?: string;
              amount?: number;
              currency?: string;
              probability?: number;
              createdAt?: string;
            }>;
          };
          const deals = body.data ?? [];

          // 2. Clear this tenant's existing deal_events, then reinsert. ALTER … DELETE
          //    is a mutation supported on every ClickHouse version.
          await clickhouse.command({
            query: `ALTER TABLE deal_events DELETE WHERE tenant_id = {tenantId:String}`,
            query_params: { tenantId },
          });

          if (deals.length > 0) {
            const values = [];
            for (const d of deals) {
              const amount = Number(d.amount ?? 0);
              const currency = String(d.currency ?? 'USD');
              const { baseAmount, baseCurrency } = await ratesService.convertToBase(tenantId, amount, currency);
              values.push({
                tenant_id: tenantId,
                deal_id: String(d.id),
                owner_id: String(d.ownerId ?? ''),
                account_id: String(d.accountId ?? ''),
                pipeline_id: String(d.pipelineId ?? ''),
                stage_id: String(d.stageId ?? ''),
                event_type: 'deal.created',
                amount,
                currency,
                base_amount: baseAmount,
                base_currency: baseCurrency,
                probability: Number(d.probability ?? 0),
                occurred_at: d.createdAt ?? new Date().toISOString(),
              });
            }
            await clickhouse.insert({ table: 'deal_events', values, format: 'JSONEachRow' });
          }

          return reply.send({ success: true, data: { dataset: 'deals', rebuilt: deals.length } });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
