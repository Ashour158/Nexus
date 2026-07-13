import type { FastifyInstance } from 'fastify';
import type { NexusProducer } from '@nexus/kafka';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission, checkPermission } from '@nexus/service-utils';
import { z } from 'zod';
import type { CrmPrisma } from '../prisma.js';
import { createAccountsService } from '../services/accounts.service.js';
import { createContactsService } from '../services/contacts.service.js';
import { createDealsService } from '../services/deals.service.js';
import { createLeadsService } from '../services/leads.service.js';
import {
  createRecycleService,
  isRecycleModule,
  type RecycleModule,
} from '../services/recycle.service.js';

const ListQuery = z.object({
  module: z.string().optional(),
  q: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

const ModuleParam = z.object({
  module: z.string(),
  id: z.string().min(1),
});

const PurgeQuery = z.object({
  olderThanDays: z.coerce.number().int().min(0),
  module: z.string().optional(),
});

/** Per-module DELETE permission — recovery/permanent-delete rights track it. */
const MODULE_DELETE_PERM: Record<RecycleModule, string> = {
  leads: PERMISSIONS.LEADS.DELETE,
  contacts: PERMISSIONS.CONTACTS.DELETE,
  accounts: PERMISSIONS.ACCOUNTS.DELETE,
  deals: PERMISSIONS.DEALS.DELETE,
};

function retentionDays(): number {
  const raw = Number(process.env.RECYCLE_BIN_RETENTION_DAYS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 30;
}

/**
 * `/api/v1/recycle-bin/*` — the unified, tenant-scoped soft-delete recovery
 * surface spanning leads / contacts / accounts / deals.
 *
 *  GET    /recycle-bin                      list soft-deleted records (all/one module)
 *  GET    /recycle-bin/retention            current retention config (days)
 *  POST   /recycle-bin/:module/:id/restore  un-delete + re-emit *.restored
 *  DELETE /recycle-bin/:module/:id          PERMANENT hard delete (admin only)
 *  POST   /recycle-bin/purge                retention purge (admin only, explicit)
 */
export async function registerRecycleBinRoutes(
  app: FastifyInstance,
  prisma: CrmPrisma,
  producer: NexusProducer
): Promise<void> {
  const accounts = createAccountsService(prisma, producer);
  const contacts = createContactsService(prisma, producer);
  const deals = createDealsService(prisma, producer);
  const leads = createLeadsService(prisma, producer);

  const recycle = createRecycleService({
    prisma,
    restorers: {
      leads: (tenantId, id) => leads.restoreLead(tenantId, id),
      contacts: (tenantId, id) => contacts.restoreContact(tenantId, id),
      accounts: (tenantId, id) => accounts.restoreAccount(tenantId, id),
      deals: (tenantId, id) => deals.restoreDeal(tenantId, id),
    },
  });

  await app.register(
    async (r) => {
      // ── LIST ────────────────────────────────────────────────────────────────
      r.get(
        '/recycle-bin',
        { preHandler: requirePermission(PERMISSIONS.DATA.READ) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const q = ListQuery.parse(request.query);
          if (q.module && !isRecycleModule(q.module)) {
            return reply.code(400).send({
              success: false,
              error: { code: 'VALIDATION_ERROR', message: `Unknown module '${q.module}'`, requestId: request.id },
            });
          }
          const data = await recycle.list(jwt.tenantId, {
            module: q.module as RecycleModule | undefined,
            q: q.q,
            page: q.page,
            pageSize: q.pageSize,
          });
          return reply.send({ success: true, data });
        }
      );

      // ── RETENTION CONFIG ──────────────────────────────────────────────────────
      r.get(
        '/recycle-bin/retention',
        { preHandler: requirePermission(PERMISSIONS.DATA.READ) },
        async (_request, reply) => {
          const days = retentionDays();
          return reply.send({
            success: true,
            data: {
              retentionDays: days,
              // Records deleted before this instant are eligible for admin purge.
              purgeEligibleBefore: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString(),
              autoPurge: false,
            },
          });
        }
      );

      // ── RESTORE ───────────────────────────────────────────────────────────────
      r.post('/recycle-bin/:module/:id/restore', async (request, reply) => {
        const jwt = request.user as JwtPayload;
        const { module, id } = ModuleParam.parse(request.params);
        if (!isRecycleModule(module)) {
          return reply.code(400).send({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: `Unknown module '${module}'`, requestId: request.id },
          });
        }
        if (!checkPermission(jwt.permissions ?? [], MODULE_DELETE_PERM[module])) {
          return reply.code(403).send({
            success: false,
            error: { code: 'FORBIDDEN', message: `Missing permission to restore ${module}`, requestId: request.id },
          });
        }
        const data = await recycle.restore(module, jwt.tenantId, id);
        return reply.send({ success: true, data });
      });

      // ── PERMANENT (HARD) DELETE — admin only ──────────────────────────────────
      r.delete(
        '/recycle-bin/:module/:id',
        { preHandler: requirePermission(PERMISSIONS.DATA.ADMIN) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { module, id } = ModuleParam.parse(request.params);
          if (!isRecycleModule(module)) {
            return reply.code(400).send({
              success: false,
              error: { code: 'VALIDATION_ERROR', message: `Unknown module '${module}'`, requestId: request.id },
            });
          }
          const data = await recycle.hardDelete(module, jwt.tenantId, id);
          return reply.send({ success: true, data });
        }
      );

      // ── RETENTION PURGE — admin only, explicit action, never automatic ────────
      r.post(
        '/recycle-bin/purge',
        { preHandler: requirePermission(PERMISSIONS.DATA.ADMIN) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const q = PurgeQuery.parse(request.query);
          if (q.module && !isRecycleModule(q.module)) {
            return reply.code(400).send({
              success: false,
              error: { code: 'VALIDATION_ERROR', message: `Unknown module '${q.module}'`, requestId: request.id },
            });
          }
          const data = await recycle.purge(jwt.tenantId, {
            olderThanDays: q.olderThanDays,
            module: q.module as RecycleModule | undefined,
          });
          return reply.send({ success: true, data });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
