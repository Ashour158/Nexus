import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission, ValidationError } from '@nexus/service-utils';
import type { CrmPrisma } from '../prisma.js';
import type { createDedupService } from '../services/dedup.service.js';

type DedupService = ReturnType<typeof createDedupService>;

/**
 * RR-H14 — deal duplicate detection + merge.
 *
 * Generalizes the Contact/Account dedup+merge flow to Deals:
 *   - `POST /api/v1/deals/dedup/scan`   — kick off a background deal scan.
 *   - `GET  /api/v1/deals/dedup/groups` — list pending deal duplicate groups
 *                                         (records enriched with deal data).
 *   - `POST /api/v1/deals/merge`        — merge `{ survivorId, mergedIds[],
 *                                         fieldResolutions? }`.
 *
 * Deal duplicate groups reuse the shared `DuplicateGroup`/`DuplicateRecord`
 * tables with `entityType = 'deal'` (the objectType discriminator), so no new
 * storage is required.
 */
export async function registerDealDedupRoutes(
  app: FastifyInstance,
  prisma: CrmPrisma,
  dedupService: DedupService
): Promise<void> {
  const p = prisma as any;

  const MergeBodySchema = z
    .object({
      survivorId: z.string().cuid(),
      mergedIds: z.array(z.string().cuid()).min(1).max(50),
      // Optional per-field survivor overrides, same shape as the group merge.
      fieldResolutions: z
        .record(z.object({ sourceId: z.string().cuid().optional(), value: z.unknown() }))
        .optional(),
    })
    .strict();

  await app.register(
    async (r) => {
      // ─── SCAN ───────────────────────────────────────────────────────────
      r.post(
        '/deals/dedup/scan',
        { preHandler: requirePermission(PERMISSIONS.DEALS.UPDATE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          dedupService
            .runDealScan(jwt.tenantId)
            .catch((err) => app.log.error({ err }, 'Deal dedup scan failed'));
          return reply.send({
            success: true,
            message: 'Deal duplicate scan started. Results will be available within 2 minutes.',
          });
        }
      );

      // ─── GROUPS ─────────────────────────────────────────────────────────
      r.get(
        '/deals/dedup/groups',
        { preHandler: requirePermission(PERMISSIONS.DEALS.READ) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { status = 'pending', limit = '20', offset = '0' } = request.query as {
            status?: string;
            limit?: string;
            offset?: string;
          };
          const where = { tenantId: jwt.tenantId, entityType: 'deal', status };

          const [total, groups] = await Promise.all([
            p.duplicateGroup.count({ where }),
            p.duplicateGroup.findMany({
              where,
              include: { records: true },
              orderBy: { createdAt: 'desc' },
              take: Number(limit),
              skip: Number(offset),
            }),
          ]);

          // Batch-load all referenced deals in one query (no N+1).
          const dealIds: string[] = [];
          for (const g of groups) for (const rec of g.records) dealIds.push(rec.recordId);
          const deals = dealIds.length
            ? await p.deal.findMany({
                where: { id: { in: dealIds } },
                select: {
                  id: true, name: true, amount: true, currency: true,
                  accountId: true, ownerId: true, pipelineId: true, stageId: true,
                  status: true, expectedCloseDate: true, createdAt: true,
                },
              })
            : [];
          const dealMap = new Map(deals.map((d: { id: string }) => [d.id, d]));

          const enriched = groups.map((g: any) => ({
            ...g,
            records: g.records.map((rec: any) => ({ ...rec, data: dealMap.get(rec.recordId) ?? null })),
          }));

          return reply.send({ success: true, data: { total, groups: enriched } });
        }
      );

      // ─── MERGE ──────────────────────────────────────────────────────────
      r.post(
        '/deals/merge',
        { preHandler: requirePermission(PERMISSIONS.DEALS.DELETE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const parsed = MergeBodySchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const { survivorId, mergedIds, fieldResolutions } = parsed.data;
          const result = await dedupService.mergeDeals(
            jwt.tenantId,
            survivorId,
            mergedIds,
            fieldResolutions,
            jwt.sub
          );
          return reply.send({ success: true, data: result });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
