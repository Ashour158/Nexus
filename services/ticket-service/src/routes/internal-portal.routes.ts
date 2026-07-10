/**
 * Internal, account-scoped ticket read surface consumed by portal-service.
 *
 * A logged-in PortalUser is bound to a single `accountId`. portal-service calls
 * this with `x-service-token: $INTERNAL_SERVICE_TOKEN` + `x-tenant-id` to render
 * the customer's support tickets.
 *
 * Trust model: self-verify `x-service-token` against `INTERNAL_SERVICE_TOKEN`
 * (401 otherwise) and derive `tenantId` from the `x-tenant-id` header (400 if
 * empty). The read is scoped by BOTH tenantId AND the path `accountId` — an
 * accountId is never trusted without also pinning tenantId — so a portal caller
 * can only ever see one account's tickets within one tenant.
 *
 * Customer-safe projection: internal-only agent fields (assignee/team/SLA
 * bookkeeping, customFields) are omitted, soft-deleted tickets are excluded,
 * and only PUBLIC comments (`isInternal = false`) are attached — internal
 * agent notes are never returned.
 *
 * Route lives under `/api/v1/internal/...` so the shared bootstrap's
 * `isInternalServiceRoute` bypasses the end-user JWT preHandler for
 * service-token callers and seeds tenant ALS from `x-tenant-id`.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { TicketPrisma } from '../prisma.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

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
  return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message, requestId } });
}

function tenantIdFromHeader(req: FastifyRequest): string {
  const raw = req.headers['x-tenant-id'];
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : '';
}

/** Customer-safe ticket columns — omits assignee/team/SLA/customFields. */
const TICKET_SAFE_SELECT = {
  id: true,
  number: true,
  subject: true,
  description: true,
  status: true,
  priority: true,
  type: true,
  channel: true,
  accountId: true,
  requesterContactId: true,
  requesterEmail: true,
  tags: true,
  firstRespondedAt: true,
  resolvedAt: true,
  closedAt: true,
  createdAt: true,
  updatedAt: true,
  // Only public (customer-visible) comments — internal notes are excluded.
  comments: {
    where: { isInternal: false },
    orderBy: { createdAt: 'asc' },
    select: { id: true, body: true, authorId: true, createdAt: true },
  },
} as const;

export async function registerInternalPortalRoutes(
  app: FastifyInstance,
  prisma: TicketPrisma
): Promise<void> {
  await app.register(
    async (r) => {
      r.get('/internal/accounts/:accountId/tickets', async (req, reply) => {
        if (!verifyServiceToken(req)) return unauthorized(reply, req.id);
        const tenantId = tenantIdFromHeader(req);
        if (!tenantId) return badRequest(reply, req.id, 'x-tenant-id is required');
        const { accountId } = req.params as { accountId: string };
        if (!accountId) return badRequest(reply, req.id, 'accountId is required');
        const q = ListQuerySchema.safeParse(req.query);
        if (!q.success) return badRequest(reply, req.id, 'Invalid pagination');

        const rows = await prisma.ticket.findMany({
          where: { tenantId, accountId, deletedAt: null },
          select: TICKET_SAFE_SELECT,
          orderBy: { createdAt: 'desc' },
          take: q.data.limit,
          skip: q.data.offset,
        });
        return reply.send({ success: true, data: rows });
      });
    },
    { prefix: '/api/v1' }
  );
}
