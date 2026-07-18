import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { FinancePrisma } from '../prisma.js';

/**
 * Search reindex source for quotes — see the equivalent module in crm-service
 * for the full rationale. In short: search-service indexes live events, so any
 * quote created before the indexer went live is unsearchable until it can be
 * re-pulled from here. Its reindex route called this path all along; it was
 * never implemented, so the backfill failed with `source returned 404`.
 *
 * Contract (search-service routes/reindex.routes.ts):
 *   GET /api/v1/internal/search-source/quotes?tenantId=<id>&limit=<n>[&cursor=<id>]
 *   headers: x-service-token, x-tenant-id
 *   200 { success: true, data: { items: [...], nextCursor: string | null } }
 */

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 1000;

function verifyServiceToken(req: FastifyRequest): boolean {
  const token = req.headers['x-service-token'];
  const expected = process.env.INTERNAL_SERVICE_TOKEN;
  // Fail closed: tenantId arrives in the query string, so an unset token must
  // reject rather than expose a cross-tenant read.
  return Boolean(expected && token === expected);
}

interface SourceQuery {
  tenantId?: string;
  limit?: string;
  cursor?: string;
}

export async function registerInternalSearchSourceRoutes(
  app: FastifyInstance,
  prisma: FinancePrisma
): Promise<void> {
  await app.register(
    async (r) => {
      r.get('/internal/search-source/quotes', async (request, reply) => {
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

        // Archived quotes are hidden from the product's own lists, so keep them
        // out of the index too — search should mirror what the user can see.
        // Keyset paging on `id`: a unique, immutable, totally-ordered column, so
        // concurrent writes during a long backfill can't skip or repeat a row.
        const rows = await prisma.quote.findMany({
          where: { tenantId, archivedAt: null },
          select: {
            id: true,
            tenantId: true,
            quoteNumber: true,
            name: true,
            status: true,
            currency: true,
            total: true,
            dealId: true,
            accountId: true,
            contactId: true,
            ownerId: true,
            validUntil: true,
            createdAt: true,
            updatedAt: true,
          },
          take: limit,
          orderBy: { id: 'asc' },
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });

        // `total` is a Prisma Decimal; Meili needs a plain number to sort on it.
        const items = rows.map(({ total, ...rest }) => ({
          ...rest,
          total: total == null ? null : Number(total),
        }));

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
