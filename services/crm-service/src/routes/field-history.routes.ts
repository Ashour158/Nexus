import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { CrmPrisma } from '../prisma.js';
import { getFieldHistory, type TrackedObject } from '../lib/field-history.js';

async function gateHistoryPermission(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { objectType } = request.params as { objectType?: string };
  const map: Record<string, string> = {
    deal: PERMISSIONS.DEALS.READ,
    contact: PERMISSIONS.CONTACTS.READ,
    lead: PERMISSIONS.LEADS.READ,
    account: PERMISSIONS.ACCOUNTS.READ,
  };
  const p = map[objectType ?? ''] ?? PERMISSIONS.SETTINGS.READ;
  await requirePermission(p)(request, reply);
}

export async function registerFieldHistoryRoutes(app: FastifyInstance, prisma: CrmPrisma): Promise<void> {
  await app.register(
    async (r) => {
      r.get(
        '/history/:objectType/:objectId',
        { preHandler: gateHistoryPermission },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { objectType, objectId } = request.params as {
            objectType: string;
            objectId: string;
          };
          const { field } = request.query as { field?: string };
          const ot = ['deal', 'contact', 'lead', 'account'].includes(objectType)
            ? (objectType as TrackedObject)
            : null;
          if (!ot) {
            return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid objectType', requestId: request.id } });
          }
          const history = await getFieldHistory(prisma, jwt.tenantId, ot, objectId, field);
          return reply.send({ success: true, data: history });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
