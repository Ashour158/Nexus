import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { KnowledgePrisma } from '../prisma.js';

/**
 * Search reindex source for KB articles — the counterpart to the modules in
 * crm-service and finance-service. search-service indexes live events, so any
 * article that predates the indexer is unsearchable until re-pulled from here.
 *
 * This source previously failed with 401 rather than 404: the shared
 * `createService` bootstrap only bypasses its JWT preHandler for
 * `/api/v1/internal/*` when the request carries an `x-service-token` matching
 * INTERNAL_SERVICE_TOKEN — and that var was not set on this service, so the
 * bypass could never match and the call fell through to end-user JWT auth.
 * (Fixed alongside this route in docker-compose.)
 *
 * Contract (search-service routes/reindex.routes.ts):
 *   GET /api/v1/internal/search-source/articles?tenantId=<id>&limit=<n>[&cursor=<id>]
 *   headers: x-service-token, x-tenant-id
 *   200 { success: true, data: { items: [...], nextCursor: string | null } }
 */

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 1000;

function verifyServiceToken(req: FastifyRequest): boolean {
  const token = req.headers['x-service-token'];
  const expected = process.env.INTERNAL_SERVICE_TOKEN;
  // Fail closed — tenantId comes from the query string, so this is a
  // cross-tenant read surface and an unset token must reject.
  return Boolean(expected && token === expected);
}

interface SourceQuery {
  tenantId?: string;
  limit?: string;
  cursor?: string;
}

export async function registerInternalSearchSourceRoutes(
  app: FastifyInstance,
  prisma: KnowledgePrisma
): Promise<void> {
  await app.register(
    async (r) => {
      r.get('/internal/search-source/articles', async (request, reply) => {
        if (!verifyServiceToken(request)) {
          return reply.code(401).send({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Unauthorized', requestId: String(request.id) },
          });
        }

        const q = request.query as SourceQuery;
        const headerTenant = request.headers['x-tenant-id'];
        const tenantId =
          typeof q.tenantId === 'string' && q.tenantId.length > 0
            ? q.tenantId
            : typeof headerTenant === 'string' && headerTenant.length > 0
              ? headerTenant
              : undefined;
        if (!tenantId) {
          return reply.code(400).send({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'tenantId is required', requestId: String(request.id) },
          });
        }

        const rawLimit = Number(q.limit ?? DEFAULT_LIMIT);
        const limit =
          !Number.isFinite(rawLimit) || rawLimit <= 0
            ? DEFAULT_LIMIT
            : Math.min(Math.floor(rawLimit), MAX_LIMIT);
        const cursor = typeof q.cursor === 'string' && q.cursor.length > 0 ? q.cursor : undefined;

        // Keyset paging on `id` — unique, immutable and totally ordered, so a
        // long backfill cannot skip or repeat a row as articles are written.
        const items = await prisma.kbArticle.findMany({
          where: { tenantId },
          select: {
            id: true,
            tenantId: true,
            title: true,
            slug: true,
            body: true,
            tags: true,
            status: true,
            categoryId: true,
            dealStages: true,
            authorId: true,
            viewCount: true,
            publishedAt: true,
            createdAt: true,
            updatedAt: true,
          },
          take: limit,
          orderBy: { id: 'asc' },
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });

        return reply.send({
          success: true,
          data: {
            items,
            nextCursor: items.length === limit && items.length > 0 ? items[items.length - 1].id : null,
          },
        });
      });
    },
    { prefix: '/api/v1' }
  );
}
