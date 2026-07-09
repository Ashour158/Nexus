import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission, NotFoundError } from '@nexus/service-utils';
import type { FinancePrisma } from '../prisma.js';
import {
  createActivity,
  createNote,
  fetchTimeline,
  type MoneyEntityType,
} from '../lib/crm-activities-client.js';

// ─── A1: activities / notes / timeline on money objects ─────────────────────
// Tenant-scoped, permission-gated surfaces on quote/invoice/order/contract that
// proxy to crm-service's polymorphic activities API, forwarding the caller JWT.
// Each money object is verified to exist within the caller's tenant BEFORE any
// proxy call so a caller can never enumerate another tenant's records via crm.

type EntityConfig = {
  entityType: MoneyEntityType;
  readPermission: string;
  writePermission: string;
  exists: (prisma: FinancePrisma, tenantId: string, id: string) => Promise<boolean>;
};

const ENTITIES: Record<string, EntityConfig> = {
  quotes: {
    entityType: 'QUOTE',
    readPermission: PERMISSIONS.QUOTES.READ,
    writePermission: PERMISSIONS.QUOTES.UPDATE,
    exists: async (prisma, tenantId, id) =>
      (await prisma.quote.count({ where: { id, tenantId } })) > 0,
  },
  invoices: {
    entityType: 'INVOICE',
    readPermission: PERMISSIONS.INVOICES.READ,
    writePermission: PERMISSIONS.INVOICES.UPDATE,
    exists: async (prisma, tenantId, id) =>
      (await prisma.invoice.count({ where: { id, tenantId } })) > 0,
  },
  orders: {
    // Orders reuse the QUOTES permission family in this service.
    entityType: 'ORDER',
    readPermission: PERMISSIONS.QUOTES.READ,
    writePermission: PERMISSIONS.QUOTES.UPDATE,
    exists: async (prisma, tenantId, id) =>
      (await prisma.salesOrder.count({ where: { id, tenantId } })) > 0,
  },
  contracts: {
    entityType: 'CONTRACT',
    readPermission: PERMISSIONS.CONTRACTS.READ,
    writePermission: PERMISSIONS.CONTRACTS.UPDATE,
    exists: async (prisma, tenantId, id) =>
      (await prisma.contract.count({ where: { id, tenantId } })) > 0,
  },
};

const IdParam = z.object({ id: z.string().min(1) });
const TimelineQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  type: z.string().min(1).optional(),
});
const NoteBody = z.object({
  content: z.string().min(1),
  subject: z.string().min(1).optional(),
  customFields: z.record(z.unknown()).optional(),
});
const ActivityBody = z
  .object({
    type: z.string().min(1).default('NOTE'),
    subject: z.string().min(1).optional(),
    description: z.string().optional(),
    dueDate: z.string().datetime().optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    priority: z.string().optional(),
    customFields: z.record(z.unknown()).optional(),
  })
  .passthrough();

function authOf(request: FastifyRequest) {
  const jwt = request.user as JwtPayload;
  return {
    authorization: typeof request.headers.authorization === 'string' ? request.headers.authorization : undefined,
    tenantId: jwt.tenantId,
  };
}

export async function registerMoneyTimelineRoutes(
  app: FastifyInstance,
  prisma: FinancePrisma
): Promise<void> {
  await app.register(
    async (r) => {
      for (const [segment, cfg] of Object.entries(ENTITIES)) {
        // ─── TIMELINE (unified activity feed) ────────────────────────────
        r.get(
          `/${segment}/:id/timeline`,
          { preHandler: requirePermission(cfg.readPermission) },
          async (request, reply) => {
            const { id } = IdParam.parse(request.params);
            const q = TimelineQuery.parse(request.query);
            const auth = authOf(request);
            if (!(await cfg.exists(prisma, auth.tenantId, id))) {
              throw new NotFoundError(cfg.entityType, id);
            }
            const res = await fetchTimeline(auth, cfg.entityType, id, q);
            return reply.code(res.status).send(res.body);
          }
        );

        // ─── NOTES (list) ────────────────────────────────────────────────
        r.get(
          `/${segment}/:id/notes`,
          { preHandler: requirePermission(cfg.readPermission) },
          async (request, reply) => {
            const { id } = IdParam.parse(request.params);
            const q = TimelineQuery.parse(request.query);
            const auth = authOf(request);
            if (!(await cfg.exists(prisma, auth.tenantId, id))) {
              throw new NotFoundError(cfg.entityType, id);
            }
            const res = await fetchTimeline(auth, cfg.entityType, id, { ...q, type: 'NOTE' });
            return reply.code(res.status).send(res.body);
          }
        );

        // ─── NOTES (create) ──────────────────────────────────────────────
        r.post(
          `/${segment}/:id/notes`,
          { preHandler: requirePermission(cfg.writePermission) },
          async (request, reply) => {
            const { id } = IdParam.parse(request.params);
            const body = NoteBody.parse(request.body);
            const auth = authOf(request);
            if (!(await cfg.exists(prisma, auth.tenantId, id))) {
              throw new NotFoundError(cfg.entityType, id);
            }
            const res = await createNote(auth, cfg.entityType, id, body);
            return reply.code(res.status).send(res.body);
          }
        );

        // ─── ACTIVITIES (create, any type) ───────────────────────────────
        r.post(
          `/${segment}/:id/activities`,
          { preHandler: requirePermission(cfg.writePermission) },
          async (request, reply) => {
            const { id } = IdParam.parse(request.params);
            const body = ActivityBody.parse(request.body);
            const auth = authOf(request);
            if (!(await cfg.exists(prisma, auth.tenantId, id))) {
              throw new NotFoundError(cfg.entityType, id);
            }
            const res = await createActivity(auth, cfg.entityType, id, body);
            return reply.code(res.status).send(res.body);
          }
        );
      }
    },
    { prefix: '/api/v1' }
  );
}
