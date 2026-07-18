import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { CrmPrisma } from '../prisma.js';

/**
 * Search reindex sources — the authoritative read side of search-service's
 * cold-start backfill (`POST /api/v1/search/reindex`).
 *
 * search-service indexes live domain events, so any record created BEFORE the
 * indexer went live (or after Meili data loss) is invisible to search forever
 * unless it can be re-pulled from the owning service. Its reindex route was
 * written to call these endpoints — but they were never implemented here, so
 * every backfill failed with `source returned 404` and most of the CRM was
 * silently unsearchable (accounts 0/30, contacts 0/81, leads 0/12, deals 1/15).
 *
 * Contract expected by search-service (routes/reindex.routes.ts):
 *   GET <path>?tenantId=<id>&limit=<n>[&cursor=<id>]
 *   headers: x-service-token, x-tenant-id
 *   200 { success: true, data: { items: [...], nextCursor: string | null } }
 *
 * Trust model matches the other internal routes here: the route self-verifies
 * `x-service-token` against INTERNAL_SERVICE_TOKEN (fail-closed — an unset token
 * rejects rather than opens, because tenantId comes from the query string and is
 * therefore a cross-tenant read surface).
 *
 * Each projection selects exactly the fields the corresponding Meili index
 * declares searchable/filterable/sortable (see search-service
 * indexes/index-schema.ts) — no `select: *`. That keeps the payload small and
 * avoids shipping PII the index has no use for.
 */

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 1000;

function verifyServiceToken(req: FastifyRequest): boolean {
  const token = req.headers['x-service-token'];
  const expected = process.env.INTERNAL_SERVICE_TOKEN;
  return Boolean(expected && token === expected);
}

function unauthorized(reply: FastifyReply, requestId: string) {
  return reply
    .code(401)
    .send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized', requestId } });
}

function badRequest(reply: FastifyReply, requestId: string, message: string) {
  return reply
    .code(400)
    .send({ success: false, error: { code: 'VALIDATION_ERROR', message, requestId } });
}

interface SourceQuery {
  tenantId?: string;
  limit?: string;
  cursor?: string;
}

/** Resolve the tenant from the query string, falling back to the header. */
function resolveTenantId(req: FastifyRequest): string | undefined {
  const q = req.query as SourceQuery;
  if (typeof q.tenantId === 'string' && q.tenantId.length > 0) return q.tenantId;
  const header = req.headers['x-tenant-id'];
  return typeof header === 'string' && header.length > 0 ? header : undefined;
}

function resolveLimit(req: FastifyRequest): number {
  const raw = Number((req.query as SourceQuery).limit ?? DEFAULT_LIMIT);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(raw), MAX_LIMIT);
}

function resolveCursor(req: FastifyRequest): string | undefined {
  const c = (req.query as SourceQuery).cursor;
  return typeof c === 'string' && c.length > 0 ? c : undefined;
}

/**
 * Keyset pagination args, ordered by `id`.
 *
 * Ordering by a unique, immutable column (rather than createdAt, which can tie)
 * guarantees a total order, so no record is skipped or repeated across pages
 * even while rows are being written during a long backfill.
 */
function pageArgs(limit: number, cursor?: string) {
  return {
    take: limit,
    orderBy: { id: 'asc' as const },
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  };
}

/** `nextCursor` is the last id only when the page was full — a short page is the end. */
function nextCursorFrom(items: Array<{ id: string }>, limit: number): string | null {
  return items.length === limit && items.length > 0 ? items[items.length - 1].id : null;
}

export async function registerInternalSearchSourceRoutes(
  app: FastifyInstance,
  prisma: CrmPrisma
): Promise<void> {
  await app.register(
    async (r) => {
      /**
       * Register one source endpoint. `fetchPage` returns the rows; everything
       * else (auth, paging, envelope, error shape) is identical across entities.
       */
      const source = (
        path: string,
        fetchPage: (
          tenantId: string,
          limit: number,
          cursor: string | undefined
        ) => Promise<Array<Record<string, unknown> & { id: string }>>
      ) => {
        r.get(path, async (request, reply) => {
          if (!verifyServiceToken(request)) return unauthorized(reply, String(request.id));
          const tenantId = resolveTenantId(request);
          if (!tenantId) return badRequest(reply, String(request.id), 'tenantId is required');

          const limit = resolveLimit(request);
          const items = await fetchPage(tenantId, limit, resolveCursor(request));
          return reply.send({
            success: true,
            data: { items, nextCursor: nextCursorFrom(items, limit) },
          });
        });
      };

      // ── Deals ───────────────────────────────────────────────────────────────
      // `accountName` is searchable on the deals index, so denormalise it here
      // via the account relation — the live indexer gets it on the event payload.
      source('/internal/search-source/deals', async (tenantId, limit, cursor) => {
        const rows = await prisma.deal.findMany({
          where: { tenantId, deletedAt: null },
          select: {
            id: true,
            tenantId: true,
            name: true,
            amount: true,
            currency: true,
            status: true,
            stageId: true,
            pipelineId: true,
            ownerId: true,
            accountId: true,
            tags: true,
            createdAt: true,
            updatedAt: true,
            account: { select: { name: true } },
          },
          ...pageArgs(limit, cursor),
        });
        // Flatten the relation into the denormalised field the index expects.
        return rows.map(({ account, amount, ...rest }) => ({
          ...rest,
          // Prisma returns Decimal for money; Meili needs a plain number to sort.
          amount: amount == null ? null : Number(amount),
          accountName: account?.name ?? null,
        }));
      });

      // ── Contacts ────────────────────────────────────────────────────────────
      source('/internal/search-source/contacts', async (tenantId, limit, cursor) => {
        return prisma.contact.findMany({
          where: { tenantId, deletedAt: null },
          select: {
            id: true,
            tenantId: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            jobTitle: true,
            ownerId: true,
            accountId: true,
            tags: true,
            createdAt: true,
            updatedAt: true,
          },
          ...pageArgs(limit, cursor),
        });
      });

      // ── Accounts ────────────────────────────────────────────────────────────
      source('/internal/search-source/accounts', async (tenantId, limit, cursor) => {
        return prisma.account.findMany({
          where: { tenantId, deletedAt: null },
          select: {
            id: true,
            tenantId: true,
            name: true,
            website: true,
            industry: true,
            type: true,
            status: true,
            ownerId: true,
            tags: true,
            createdAt: true,
            updatedAt: true,
          },
          ...pageArgs(limit, cursor),
        });
      });

      // ── Leads ───────────────────────────────────────────────────────────────
      source('/internal/search-source/leads', async (tenantId, limit, cursor) => {
        return prisma.lead.findMany({
          where: { tenantId, deletedAt: null },
          select: {
            id: true,
            tenantId: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            company: true,
            status: true,
            source: true,
            ownerId: true,
            tags: true,
            createdAt: true,
            updatedAt: true,
          },
          ...pageArgs(limit, cursor),
        });
      });

      // ── Activities ──────────────────────────────────────────────────────────
      source('/internal/search-source/activities', async (tenantId, limit, cursor) => {
        return prisma.activity.findMany({
          where: { tenantId, deletedAt: null },
          select: {
            id: true,
            tenantId: true,
            subject: true,
            description: true,
            type: true,
            status: true,
            outcome: true,
            ownerId: true,
            dealId: true,
            contactId: true,
            leadId: true,
            accountId: true,
            dueDate: true,
            createdAt: true,
            updatedAt: true,
          },
          ...pageArgs(limit, cursor),
        });
      });
    },
    { prefix: '/api/v1' }
  );
}
