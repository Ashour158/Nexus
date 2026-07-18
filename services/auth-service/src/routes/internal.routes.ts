import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AuthPrisma } from '../prisma.js';

/**
 * Internal service-to-service routes for auth-service.
 *
 * These endpoints are NOT authenticated with an end-user JWT. They self-verify
 * the shared `x-service-token` (INTERNAL_SERVICE_TOKEN) header, mirroring the
 * pattern used by finance-service `internal-operations.routes.ts`
 * (`verifyServiceToken`). The shared `createService` bootstrap skips its global
 * JWT preHandler for `/api/v1/internal/*` requests that carry a valid service
 * token (see packages/service-utils/src/server.ts), so this in-route check is
 * the authoritative gate for these routes.
 */

/**
 * Gate for the internal (docker-network-only) routes.
 *  - When `INTERNAL_SERVICE_TOKEN` IS configured → require an exact match (hardened).
 *  - When it is NOT configured (empty) → permit: these routes are not exposed
 *    through the public gateway, and requiring a token that no one is configured
 *    to send would 401 every internal caller (e.g. team-scope resolution),
 *    silently breaking cross-service features. Mirrors the "permissive when
 *    unconfigured" contract crm-service uses for its own internal routes.
 */
function verifyServiceToken(req: FastifyRequest): boolean {
  const expected = process.env.INTERNAL_SERVICE_TOKEN;
  if (!expected) return true;
  return req.headers['x-service-token'] === expected;
}

const IdParam = z.object({ id: z.string().min(1) });

export async function registerInternalRoutes(
  app: FastifyInstance,
  prisma: AuthPrisma
): Promise<void> {
  await app.register(
    async (r) => {
      /**
       * GET /api/v1/internal/users/:id/reports[?recursive=true]
       *
       * Returns the reports of manager `:id`, constrained to the manager's own
       * tenant. Consumed by crm-service `team-resolver.ts` to resolve
       * `team`-scoped record visibility for SALES_MANAGERs.
       *   - default            → DIRECT reports only (`UserProfile.managerId == :id`)
       *   - `?recursive=true`   → the WHOLE reporting sub-tree (all transitive
       *                           descendants), so a VP sees skip-level reports'
       *                           records, not just their direct line. Walked
       *                           breadth-first over the in-tenant manager graph
       *                           with a visited-set, so a stray cycle can never
       *                           loop (writes are already cycle-guarded).
       *
       * Shape: { success: true, data: [{ id, userId, managerId, tenantId, jobTitle, department }] }
       * where `id` is the report's userId (the stable user identifier the
       * caller keys off). Fails closed to an empty list when the manager has no
       * profile / no reports.
       */
      r.get('/internal/users/:id/reports', async (req, reply) => {
        if (!verifyServiceToken(req)) {
          return reply.code(401).send({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Unauthorized', requestId: req.id },
          });
        }

        const parsed = IdParam.safeParse(req.params);
        if (!parsed.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid manager id',
              details: parsed.error.flatten(),
              requestId: req.id,
            },
          });
        }
        const managerId = parsed.data.id;
        const prismaAny = prisma as any;

        // Derive the tenant to scope the lookup. The authenticated caller's JWT
        // tenant is the most reliable source (a manager operates within their own
        // tenant, and may not have a UserProfile row at all); fall back to the
        // manager's profile tenant, then an explicit x-tenant-id header.
        const jwtTenant = (req.user as { tenantId?: string } | undefined)?.tenantId;
        const managerProfile = await prismaAny.userProfile.findFirst({
          where: { userId: managerId },
          select: { tenantId: true },
        });
        const headerTenant = req.headers['x-tenant-id'];
        const tenantId =
          (typeof jwtTenant === 'string' && jwtTenant.length > 0 ? jwtTenant : undefined) ??
          managerProfile?.tenantId ??
          (typeof headerTenant === 'string' && headerTenant.trim().length > 0
            ? headerTenant
            : undefined);

        // Without a resolvable tenant we cannot safely scope — return empty
        // (team-resolver collapses this to own-scope, the safe default).
        if (!tenantId) {
          return reply.send({ success: true, data: [] });
        }

        type ProfileRow = {
          userId: string;
          managerId: string | null;
          tenantId: string;
          jobTitle: string | null;
          department: string | null;
        };
        const select = {
          userId: true,
          managerId: true,
          tenantId: true,
          jobTitle: true,
          department: true,
        };

        const rawRecursive = req.query as { recursive?: string } | undefined;
        const recursive = /^(true|1|yes|on)$/i.test(String(rawRecursive?.recursive ?? ''));

        let reports: ProfileRow[];
        if (recursive) {
          // Full sub-tree. One tenant-scoped fetch, then BFS over the
          // managerId → reports adjacency collecting every transitive descendant.
          // A visited-set bounds the walk so a stray cycle can never loop.
          const all: ProfileRow[] = await prismaAny.userProfile.findMany({
            where: { tenantId },
            select,
          });
          const childrenByManager = new Map<string, ProfileRow[]>();
          for (const p of all) {
            if (!p.managerId) continue;
            const bucket = childrenByManager.get(p.managerId);
            if (bucket) bucket.push(p);
            else childrenByManager.set(p.managerId, [p]);
          }
          const collected = new Map<string, ProfileRow>();
          const queue: string[] = [managerId];
          const seen = new Set<string>([managerId]);
          while (queue.length > 0) {
            const current = queue.shift()!;
            for (const child of childrenByManager.get(current) ?? []) {
              if (seen.has(child.userId)) continue;
              seen.add(child.userId);
              collected.set(child.userId, child);
              queue.push(child.userId);
            }
          }
          reports = [...collected.values()];
        } else {
          reports = await prismaAny.userProfile.findMany({
            where: { managerId, tenantId },
            select,
          });
        }

        const data = reports.map((p: ProfileRow) => ({
          id: p.userId,
          userId: p.userId,
          managerId: p.managerId,
          tenantId: p.tenantId,
          jobTitle: p.jobTitle,
          department: p.department,
        }));

        return reply.send({ success: true, data });
      });
    },
    { prefix: '/api/v1' }
  );
}
