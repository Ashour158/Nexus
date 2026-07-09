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

/** Consistent with finance-service: token present AND matches the configured secret. */
function verifyServiceToken(req: FastifyRequest): boolean {
  const token = req.headers['x-service-token'];
  const expected = process.env.INTERNAL_SERVICE_TOKEN;
  return Boolean(expected && token === expected);
}

const IdParam = z.object({ id: z.string().min(1) });

export async function registerInternalRoutes(
  app: FastifyInstance,
  prisma: AuthPrisma
): Promise<void> {
  await app.register(
    async (r) => {
      /**
       * GET /api/v1/internal/users/:id/reports
       *
       * Returns the direct reports of manager `:id` — the users whose
       * `UserProfile.managerId` equals `:id`, constrained to the manager's own
       * tenant. Consumed by crm-service `team-resolver.ts` to resolve
       * `team`-scoped record visibility for SALES_MANAGERs.
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

        // Derive the tenant to scope the lookup. Prefer the manager's own
        // profile tenant so we never cross tenant boundaries; fall back to an
        // explicit x-tenant-id header when the manager has no profile row.
        const managerProfile = await prismaAny.userProfile.findFirst({
          where: { userId: managerId },
          select: { tenantId: true },
        });
        const headerTenant = req.headers['x-tenant-id'];
        const tenantId =
          managerProfile?.tenantId ??
          (typeof headerTenant === 'string' && headerTenant.trim().length > 0
            ? headerTenant
            : undefined);

        // Without a resolvable tenant we cannot safely scope — return empty
        // (team-resolver collapses this to own-scope, the safe default).
        if (!tenantId) {
          return reply.send({ success: true, data: [] });
        }

        const reports = await prismaAny.userProfile.findMany({
          where: { managerId, tenantId },
          select: {
            userId: true,
            managerId: true,
            tenantId: true,
            jobTitle: true,
            department: true,
          },
        });

        const data = reports.map((p: { userId: string; managerId: string | null; tenantId: string; jobTitle: string | null; department: string | null }) => ({
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
