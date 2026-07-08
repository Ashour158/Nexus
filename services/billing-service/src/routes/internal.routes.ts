import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { BillingPrisma } from '../prisma.js';
import { resolveTenantEntitlements } from '../lib/entitlements.js';

const QuerySchema = z.object({ tenantId: z.string().min(1) });

/**
 * Internal (service-to-service) entitlements lookup consumed by the reusable
 * `requireEntitlement` guard in @nexus/service-utils. Registered OUTSIDE the
 * `/api/v1/billing` public prefix, under `/internal`.
 *
 * Auth: this is a service-only endpoint. The global preHandler in
 * `createService` bypasses end-user JWT for `/internal/*` paths ONLY when a
 * matching `x-service-token` (INTERNAL_SERVICE_TOKEN) is present; but a request
 * carrying a *valid end-user JWT* would otherwise pass and could read another
 * tenant's entitlement set via `?tenantId=`. To prevent that IDOR, the handler
 * ALSO verifies the service token itself and 403s without it. It never returns
 * tenant PII — only the feature-key set + plan/status.
 */
export async function registerInternalRoutes(
  app: FastifyInstance,
  prisma: BillingPrisma
): Promise<void> {
  await app.register(
    async (r) => {
      r.get('/entitlements', async (request: FastifyRequest, reply) => {
        const expected = process.env.INTERNAL_SERVICE_TOKEN;
        const provided = request.headers['x-service-token'];
        if (!expected || provided !== expected) {
          return reply.code(403).send({
            success: false,
            error: { code: 'FORBIDDEN', message: 'Valid x-service-token required' },
          });
        }
        const parsed = QuerySchema.safeParse(request.query);
        if (!parsed.success) {
          return reply.code(400).send({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'tenantId is required' },
          });
        }
        const { tenantId } = parsed.data;
        const result = await resolveTenantEntitlements(prisma, tenantId);
        return reply.send({ success: true, data: { tenantId, ...result } });
      });
    },
    { prefix: '/internal' }
  );
}
