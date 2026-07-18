import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import { z } from 'zod';
import type { CrmPrisma } from '../prisma.js';
import { getFieldHistory, getFieldHistoryPaged, type TrackedObject } from '../lib/field-history.js';
import { getReadBlockedFields } from '../lib/write-guards.js';

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

// Plural `:module` route param → canonical singular objectType used by BOTH the
// FieldChangeLog rows and the FieldPermission (FLS) `module` key.
const MODULE_TO_OBJECT: Record<string, TrackedObject> = {
  leads: 'lead',
  contacts: 'contact',
  accounts: 'account',
  deals: 'deal',
  // tolerate singular too
  lead: 'lead',
  contact: 'contact',
  account: 'account',
  deal: 'deal',
};

const READ_PERM: Record<TrackedObject, string> = {
  lead: PERMISSIONS.LEADS.READ,
  contact: PERMISSIONS.CONTACTS.READ,
  account: PERMISSIONS.ACCOUNTS.READ,
  deal: PERMISSIONS.DEALS.READ,
};

const HistoryQuery = z.object({
  field: z.string().max(120).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
});

export async function registerFieldHistoryRoutes(app: FastifyInstance, prisma: CrmPrisma): Promise<void> {
  await app.register(
    async (r) => {
      // Legacy shape (kept for back-compat): flat, unpaginated, non-masked list.
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

      // Unified per-record timeline: `/api/v1/:module/:id/history`.
      // Paginated, newest-first, FLS-masked (rows for fields the caller may not
      // read are excluded from BOTH the page and the total) with changedBy /
      // changedByName resolved on each entry.
      r.get(
        '/:module/:id/history',
        {
          preHandler: async (request, reply) => {
            const { module } = request.params as { module?: string };
            const ot = MODULE_TO_OBJECT[module ?? ''];
            if (!ot) return; // unknown module → handled (404) in the body
            await requirePermission(READ_PERM[ot])(request, reply);
          },
        },
        async (request, reply) => {
          const { module, id } = request.params as { module: string; id: string };
          const ot = MODULE_TO_OBJECT[module];
          if (!ot) {
            return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: `Unknown module '${module}'`, requestId: request.id } });
          }
          const jwt = request.user as JwtPayload;
          const q = HistoryQuery.parse(request.query);

          // FLS: fields the caller cannot READ are hidden from the timeline. Reuses
          // the same DEFAULT-ALLOW / most-permissive-role-wins evaluation as the
          // read-mask on the record itself.
          const blockedFields = await getReadBlockedFields(prisma, jwt.tenantId, ot, jwt.roles ?? []);

          const data = await getFieldHistoryPaged(prisma, jwt.tenantId, ot, id, {
            page: q.page,
            pageSize: q.pageSize,
            fieldName: q.field,
            blockedFields,
          });
          return reply.send({ success: true, data });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
