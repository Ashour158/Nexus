/**
 * Service-to-service internal routes for territory-service.
 * No end-user JWT — protected by `x-service-token`.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { createTerritoriesService } from '../services/territories.service.js';

function verifyServiceToken(req: FastifyRequest): boolean {
  const token = req.headers['x-service-token'];
  const expected = process.env.INTERNAL_SERVICE_TOKEN;
  return Boolean(expected && token === expected);
}

const AssignLeadBody = z.object({
  leadId: z.string().min(1),
  leadData: z.record(z.unknown()),
});

export async function registerTerritoryInternalRoutes(
  app: FastifyInstance,
  territories: ReturnType<typeof createTerritoriesService>
): Promise<void> {
  await app.register(
    async (r) => {
      /** POST assign lead to territory (synchronous). */
      r.post('/internal/territories/assign-lead', async (req, reply) => {
        if (!verifyServiceToken(req)) {
          return reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized', requestId: req.id } });
        }
        const tenantId = String(req.headers['x-tenant-id'] ?? '');
        if (!tenantId) {
          return reply.code(400).send({ success: false, error: { code: 'MISSING_X_TENANT_ID', message: 'Missing X-Tenant-Id header', requestId: req.id } });
        }
        const parsed = AssignLeadBody.safeParse(req.body);
        if (!parsed.success) {
          return reply.code(400).send({ success: false, error: { code: 'BAD_REQUEST', message: 'Invalid body', details: parsed.error.flatten() } });
        }
        const result = await territories.assignLead(tenantId, { ...parsed.data.leadData, id: parsed.data.leadId });
        return reply.send({ success: true, data: result });
      });
    },
    { prefix: '/api/v1' }
  );
}
