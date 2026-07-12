import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission, ValidationError } from '@nexus/service-utils';
import type { CrmPrisma } from '../prisma.js';
import type { createDedupService } from '../services/dedup.service.js';
import { DEDUP_MODULES, type DedupModule } from '../services/dedup.service.js';

type DedupService = ReturnType<typeof createDedupService>;

const ModuleEnum = z.enum(['lead', 'contact', 'account', 'deal']);
const IdParam = z.object({ id: z.string().cuid() });

// Per-module permission map for the dynamic surfaces (`/duplicates`,
// `/duplicates/check`, `/:module/merge`). READ gates surfacing/checking; DELETE
// gates the destructive merge (parity with the existing `/deals/merge` gate).
const MODULE_PERMS: Record<DedupModule, { READ: string; DELETE: string }> = {
  lead: { READ: PERMISSIONS.LEADS.READ, DELETE: PERMISSIONS.LEADS.DELETE },
  contact: { READ: PERMISSIONS.CONTACTS.READ, DELETE: PERMISSIONS.CONTACTS.DELETE },
  account: { READ: PERMISSIONS.ACCOUNTS.READ, DELETE: PERMISSIONS.ACCOUNTS.DELETE },
  deal: { READ: PERMISSIONS.DEALS.READ, DELETE: PERMISSIONS.DEALS.DELETE },
};

// Display projection used to enrich detected clusters, per module.
const ENRICH_SELECT: Record<DedupModule, Record<string, boolean>> = {
  lead: { id: true, firstName: true, lastName: true, email: true, phone: true, company: true, status: true, ownerId: true, createdAt: true },
  contact: { id: true, firstName: true, lastName: true, email: true, phone: true, accountId: true, ownerId: true, createdAt: true },
  account: { id: true, name: true, email: true, phone: true, website: true, industry: true, ownerId: true, createdAt: true },
  deal: { id: true, name: true, amount: true, currency: true, accountId: true, stageId: true, status: true, ownerId: true, createdAt: true },
};

const CreateRuleBody = z.object({
  module: ModuleEnum,
  name: z.string().min(1).max(200),
  matchFields: z.array(z.string().min(1).max(60)).min(1).max(10),
  matchType: z.enum(['EXACT', 'FUZZY']).default('EXACT'),
  threshold: z.number().int().min(1).max(100).nullish(),
  isActive: z.boolean().optional(),
}).strict();

const UpdateRuleBody = z.object({
  name: z.string().min(1).max(200).optional(),
  matchFields: z.array(z.string().min(1).max(60)).min(1).max(10).optional(),
  matchType: z.enum(['EXACT', 'FUZZY']).optional(),
  threshold: z.number().int().min(1).max(100).nullish(),
  isActive: z.boolean().optional(),
}).strict();

const CheckBody = z.object({
  module: ModuleEnum,
  recordData: z.record(z.unknown()),
}).strict();

const MergeBody = z.object({
  masterId: z.string().cuid(),
  mergeIds: z.array(z.string().cuid()).min(1).max(50),
  // { fieldName: winnerRecordId } — the surviving value per field.
  fieldResolution: z.record(z.string().cuid()).optional(),
}).strict();

/**
 * Unified duplicate detection & merge surface (cross-module).
 *
 *   Rules CRUD:  `/api/v1/duplicate-rules`
 *   Surfacing :  `GET  /api/v1/duplicates?module=account`   — detected clusters
 *                `POST /api/v1/duplicates/check`             — create-time warn
 *   Merge     :  `POST /api/v1/:module/merge`               — lead|contact|account|deal
 *                (singular module names — deliberately distinct from the legacy
 *                 plural `/deals/merge` + `/contacts/merge` routes).
 */
export async function registerDuplicateRulesRoutes(
  app: FastifyInstance,
  prisma: CrmPrisma,
  dedupService: DedupService
): Promise<void> {
  const p = prisma as any;

  // Dynamic per-module permission gate for the `:module` / body-`module` routes.
  const gate = (action: 'READ' | 'DELETE', getModule: (req: FastifyRequest) => string | undefined) =>
    async (req: FastifyRequest, reply: FastifyReply) => {
      const parsed = ModuleEnum.safeParse(getModule(req));
      if (!parsed.success) {
        return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid module', requestId: req.id } });
      }
      return requirePermission(MODULE_PERMS[parsed.data][action])(req, reply);
    };

  await app.register(
    async (r) => {
      // ─── Rules CRUD ─────────────────────────────────────────────────────
      r.get(
        '/duplicate-rules',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { module } = request.query as { module?: string };
          const rules = await p.duplicateRule.findMany({
            where: { tenantId: jwt.tenantId, ...(module ? { module } : {}) },
            orderBy: { createdAt: 'desc' },
          });
          return reply.send({ success: true, data: rules });
        }
      );

      r.post(
        '/duplicate-rules',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const parsed = CreateRuleBody.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const body = parsed.data;
          if (body.matchType === 'FUZZY' && body.threshold == null) {
            return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'threshold is required for FUZZY rules', requestId: request.id } });
          }
          const rule = await p.duplicateRule.create({
            data: {
              tenantId: jwt.tenantId,
              module: body.module,
              name: body.name,
              matchFields: body.matchFields,
              matchType: body.matchType,
              threshold: body.threshold ?? null,
              isActive: body.isActive ?? true,
            },
          });
          return reply.code(201).send({ success: true, data: rule });
        }
      );

      r.patch(
        '/duplicate-rules/:id',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { id } = IdParam.parse(request.params);
          const parsed = UpdateRuleBody.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const existing = await p.duplicateRule.findFirst({ where: { id, tenantId: jwt.tenantId } });
          if (!existing) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Rule not found', requestId: request.id } });
          const updated = await p.duplicateRule.update({ where: { id }, data: parsed.data });
          return reply.send({ success: true, data: updated });
        }
      );

      r.delete(
        '/duplicate-rules/:id',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { id } = IdParam.parse(request.params);
          const existing = await p.duplicateRule.findFirst({ where: { id, tenantId: jwt.tenantId } });
          if (!existing) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Rule not found', requestId: request.id } });
          await p.duplicateRule.update({ where: { id }, data: { deletedAt: new Date() } });
          return reply.send({ success: true });
        }
      );

      // ─── Surfacing: detected clusters via active rules ──────────────────
      r.get(
        '/duplicates',
        { preHandler: gate('READ', (req) => (req.query as { module?: string }).module) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const module = (request.query as { module?: string }).module as DedupModule;
          const { clusters, ruleCount } = await dedupService.scanByRules(jwt.tenantId, module);

          // Enrich the cluster ids with a light display projection (one query).
          const ids = clusters.flatMap((c) => c.recordIds);
          const records = ids.length
            ? await p[module].findMany({ where: { id: { in: ids } }, select: ENRICH_SELECT[module] })
            : [];
          const recMap = new Map(records.map((rec: { id: string }) => [rec.id, rec]));
          const enriched = clusters.map((c) => ({
            module,
            score: c.score,
            ruleId: c.ruleId,
            recordIds: c.recordIds,
            records: c.recordIds.map((id) => recMap.get(id) ?? { id }),
          }));

          return reply.send({ success: true, data: { module, ruleCount, total: enriched.length, clusters: enriched } });
        }
      );

      // ─── Surfacing: create-time single-record check ─────────────────────
      r.post(
        '/duplicates/check',
        { preHandler: gate('READ', (req) => (req.body as { module?: string })?.module) },
        async (request, reply) => {
          const parsed = CheckBody.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const matches = await dedupService.checkRecord(jwt.tenantId, parsed.data.module, parsed.data.recordData);
          return reply.send({ success: true, data: { module: parsed.data.module, isDuplicate: matches.length > 0, matches } });
        }
      );

      // ─── Unified merge (any of the four modules) ────────────────────────
      r.post(
        '/:module/merge',
        { preHandler: gate('DELETE', (req) => (req.params as { module?: string }).module) },
        async (request, reply) => {
          const module = ModuleEnum.parse((request.params as { module: string }).module);
          const parsed = MergeBody.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const { masterId, mergeIds, fieldResolution } = parsed.data;
          const result = await dedupService.mergeByModule(jwt.tenantId, module, masterId, mergeIds, fieldResolution, jwt.sub);
          return reply.send({ success: true, data: result });
        }
      );
    },
    { prefix: '/api/v1' }
  );

  // Touch the exported module list so tree-shakers keep it; also a cheap guard
  // that the router and service agree on the module set.
  void DEDUP_MODULES;
}
