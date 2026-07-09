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

const AssignBody = z.object({
  tenantId: z.string().min(1).optional(),
  entityType: z.enum(['lead', 'deal']),
  fields: z.record(z.unknown()),
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

      /**
       * B6 assignment resolver (criteria-JSON rules). Given an entity's fields,
       * return the winning `{ territoryId, ownerId }`. Read-only (no persistence,
       * no event) so crm-service can call it inline on lead/deal create. tenantId
       * is taken from the body (preferred) or the `x-tenant-id` header.
       */
      r.post('/internal/territories/assign', async (req, reply) => {
        if (!verifyServiceToken(req)) {
          return reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized', requestId: req.id } });
        }
        const parsed = AssignBody.safeParse(req.body);
        if (!parsed.success) {
          return reply.code(400).send({ success: false, error: { code: 'BAD_REQUEST', message: 'Invalid body', details: parsed.error.flatten() } });
        }
        const tenantId = parsed.data.tenantId ?? String(req.headers['x-tenant-id'] ?? '');
        if (!tenantId) {
          return reply.code(400).send({ success: false, error: { code: 'MISSING_TENANT', message: 'tenantId (body) or X-Tenant-Id header required', requestId: req.id } });
        }
        const result = await territories.assign(tenantId, parsed.data.entityType, parsed.data.fields);
        return reply.send({ success: true, data: result });
      });
    },
    { prefix: '/api/v1' }
  );
}
