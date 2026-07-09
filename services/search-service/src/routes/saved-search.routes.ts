import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, ValidationError, requirePermission } from '@nexus/service-utils';
import type { SearchPrisma } from '../prisma.js';

// Cap of recent-search rows kept per (tenant, user). Older rows beyond this are
// pruned on each record so history stays small and fast to read.
const RECENT_LIMIT = 10;

const CreateSavedSearchSchema = z.object({
  name: z.string().min(1).max(120),
  query: z.string().min(1).max(500),
  entityType: z.string().max(50).optional(),
  filters: z.record(z.unknown()).optional(),
});

const ListRecentQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(RECENT_LIMIT).default(RECENT_LIMIT),
});

/**
 * Records a recent-search entry for a user. Fail-open: any error is swallowed so
 * it never slows down or breaks the search request that triggered it. Dedupes by
 * query (upsert bumps searchedAt) and prunes to the newest RECENT_LIMIT rows.
 */
export async function recordRecentSearch(
  prisma: SearchPrisma,
  tenantId: string,
  userId: string,
  query: string,
  entityType?: string
): Promise<void> {
  const q = query.trim();
  if (!q) return;
  try {
    await prisma.recentSearch.upsert({
      where: { tenantId_userId_query: { tenantId, userId, query: q } },
      update: { searchedAt: new Date(), entityType: entityType ?? null },
      create: { tenantId, userId, query: q, entityType: entityType ?? null },
    });

    // Prune anything past the cap (keep newest RECENT_LIMIT).
    const overflow = await prisma.recentSearch.findMany({
      where: { tenantId, userId },
      orderBy: { searchedAt: 'desc' },
      skip: RECENT_LIMIT,
      select: { id: true },
    });
    if (overflow.length > 0) {
      await prisma.recentSearch.deleteMany({
        where: { id: { in: overflow.map((r: { id: string }) => r.id) } },
      });
    }
  } catch {
    // fail-open — never propagate
  }
}

export async function registerSavedSearchRoutes(
  app: FastifyInstance,
  prisma: SearchPrisma
): Promise<void> {
  await app.register(
    async (r) => {
      // List saved searches for the current user.
      r.get(
        '/search/saved',
        { preHandler: requirePermission(PERMISSIONS.DEALS.READ) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const items = await prisma.savedSearch.findMany({
            where: { tenantId: jwt.tenantId, userId: jwt.sub },
            orderBy: { createdAt: 'desc' },
          });
          return reply.send({ success: true, data: items });
        }
      );

      // Create a saved search.
      r.post(
        '/search/saved',
        { preHandler: requirePermission(PERMISSIONS.DEALS.READ) },
        async (request, reply) => {
          const parsed = CreateSavedSearchSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid saved search', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const created = await prisma.savedSearch.create({
            data: {
              tenantId: jwt.tenantId,
              userId: jwt.sub,
              name: parsed.data.name,
              query: parsed.data.query,
              entityType: parsed.data.entityType ?? null,
              filters: (parsed.data.filters ?? undefined) as never,
            },
          });
          return reply.status(201).send({ success: true, data: created });
        }
      );

      // Delete a saved search (scoped to the owner).
      r.delete(
        '/search/saved/:id',
        { preHandler: requirePermission(PERMISSIONS.DEALS.READ) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { id } = request.params as { id: string };
          const result = await prisma.savedSearch.deleteMany({
            where: { id, tenantId: jwt.tenantId, userId: jwt.sub },
          });
          if (result.count === 0) {
            return reply.status(404).send({ success: false, error: 'NOT_FOUND' });
          }
          return reply.send({ success: true });
        }
      );

      // List recent searches for the current user.
      r.get(
        '/search/recent',
        { preHandler: requirePermission(PERMISSIONS.DEALS.READ) },
        async (request, reply) => {
          const parsed = ListRecentQuerySchema.safeParse(request.query);
          if (!parsed.success) throw new ValidationError('Invalid query', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const items = await prisma.recentSearch.findMany({
            where: { tenantId: jwt.tenantId, userId: jwt.sub },
            orderBy: { searchedAt: 'desc' },
            take: parsed.data.limit,
          });
          return reply.send({ success: true, data: items });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
