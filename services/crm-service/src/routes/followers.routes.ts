import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission, NotFoundError } from '@nexus/service-utils';
import { IdParamSchema } from '@nexus/validation';
import type { CrmPrisma } from '../prisma.js';

const FollowingQuerySchema = z.object({
  entityType: z.enum(['account', 'contact', 'deal']).optional(),
});
const FeedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/**
 * Registers the follow / subscribe + personal-feed route family
 * (Section — "Follow / Subscribe"). Additive, tenant-scoped, self-service:
 * a user may follow/unfollow any record they can READ, and read their own feed.
 *
 * Routes (relative to /api/v1):
 *  - POST   /accounts/:id/follow        (toggle-on for the JWT user)
 *  - DELETE /accounts/:id/follow        (toggle-off)
 *  - GET    /accounts/:id/followers
 *  - POST/DELETE/GET /contacts/:id/follow[ers]  (same trio)
 *  - GET    /me/following?entityType=
 *  - GET    /me/feed?limit=
 */
export async function registerFollowersRoutes(
  app: FastifyInstance,
  prisma: CrmPrisma
): Promise<void> {
  async function assertAccountExists(tenantId: string, id: string): Promise<void> {
    const row = await prisma.account.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!row) throw new NotFoundError('Account', id);
  }
  async function assertContactExists(tenantId: string, id: string): Promise<void> {
    const row = await prisma.contact.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!row) throw new NotFoundError('Contact', id);
  }
  async function assertDealExists(tenantId: string, id: string): Promise<void> {
    const row = await prisma.deal.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!row) throw new NotFoundError('Deal', id);
  }

  async function follow(tenantId: string, userId: string, entityType: string, entityId: string) {
    // Idempotent: unique([tenantId,userId,entityType,entityId]) makes upsert a no-op on re-follow.
    return prisma.recordFollower.upsert({
      where: {
        tenantId_userId_entityType_entityId: { tenantId, userId, entityType, entityId },
      },
      create: { tenantId, userId, entityType, entityId },
      update: {},
    });
  }

  async function unfollow(tenantId: string, userId: string, entityType: string, entityId: string) {
    await prisma.recordFollower.deleteMany({ where: { tenantId, userId, entityType, entityId } });
  }

  async function listFollowers(tenantId: string, entityType: string, entityId: string) {
    return prisma.recordFollower.findMany({
      where: { tenantId, entityType, entityId },
      orderBy: { createdAt: 'asc' },
    });
  }

  await app.register(
    async (r) => {
      // ─── ACCOUNTS follow trio ───────────────────────────────────────────
      r.post(
        '/accounts/:id/follow',
        { preHandler: requirePermission(PERMISSIONS.ACCOUNTS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          await assertAccountExists(jwt.tenantId, id);
          const data = await follow(jwt.tenantId, jwt.sub, 'account', id);
          return reply.code(201).send({ success: true, data: { following: true, follower: data } });
        }
      );

      r.delete(
        '/accounts/:id/follow',
        { preHandler: requirePermission(PERMISSIONS.ACCOUNTS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          await unfollow(jwt.tenantId, jwt.sub, 'account', id);
          return reply.send({ success: true, data: { following: false } });
        }
      );

      r.get(
        '/accounts/:id/followers',
        { preHandler: requirePermission(PERMISSIONS.ACCOUNTS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const data = await listFollowers(jwt.tenantId, 'account', id);
          return reply.send({ success: true, data });
        }
      );

      // ─── CONTACTS follow trio ───────────────────────────────────────────
      r.post(
        '/contacts/:id/follow',
        { preHandler: requirePermission(PERMISSIONS.CONTACTS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          await assertContactExists(jwt.tenantId, id);
          const data = await follow(jwt.tenantId, jwt.sub, 'contact', id);
          return reply.code(201).send({ success: true, data: { following: true, follower: data } });
        }
      );

      r.delete(
        '/contacts/:id/follow',
        { preHandler: requirePermission(PERMISSIONS.CONTACTS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          await unfollow(jwt.tenantId, jwt.sub, 'contact', id);
          return reply.send({ success: true, data: { following: false } });
        }
      );

      r.get(
        '/contacts/:id/followers',
        { preHandler: requirePermission(PERMISSIONS.CONTACTS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const data = await listFollowers(jwt.tenantId, 'contact', id);
          return reply.send({ success: true, data });
        }
      );

      // ─── DEALS follow trio ──────────────────────────────────────────────
      r.post(
        '/deals/:id/follow',
        { preHandler: requirePermission(PERMISSIONS.DEALS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          await assertDealExists(jwt.tenantId, id);
          const data = await follow(jwt.tenantId, jwt.sub, 'deal', id);
          return reply.code(201).send({ success: true, data: { following: true, follower: data } });
        }
      );

      r.delete(
        '/deals/:id/follow',
        { preHandler: requirePermission(PERMISSIONS.DEALS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          await unfollow(jwt.tenantId, jwt.sub, 'deal', id);
          return reply.send({ success: true, data: { following: false } });
        }
      );

      r.get(
        '/deals/:id/followers',
        { preHandler: requirePermission(PERMISSIONS.DEALS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const data = await listFollowers(jwt.tenantId, 'deal', id);
          return reply.send({ success: true, data });
        }
      );

      // ─── ME: records I follow ───────────────────────────────────────────
      r.get(
        '/me/following',
        { preHandler: requirePermission(PERMISSIONS.ACCOUNTS.READ) },
        async (request, reply) => {
          const parsed = FollowingQuerySchema.safeParse(request.query);
          const entityType = parsed.success ? parsed.data.entityType : undefined;
          const jwt = request.user as JwtPayload;
          const follows = await prisma.recordFollower.findMany({
            where: { tenantId: jwt.tenantId, userId: jwt.sub, ...(entityType ? { entityType } : {}) },
            orderBy: { createdAt: 'desc' },
          });

          // Join a minimal record label so the UI can render the list.
          const accountIds = follows.filter((f) => f.entityType === 'account').map((f) => f.entityId);
          const contactIds = follows.filter((f) => f.entityType === 'contact').map((f) => f.entityId);
          const dealIds = follows.filter((f) => f.entityType === 'deal').map((f) => f.entityId);
          const [accounts, contacts, deals] = await Promise.all([
            accountIds.length
              ? prisma.account.findMany({ where: { tenantId: jwt.tenantId, id: { in: accountIds } }, select: { id: true, name: true } })
              : Promise.resolve([]),
            contactIds.length
              ? prisma.contact.findMany({ where: { tenantId: jwt.tenantId, id: { in: contactIds } }, select: { id: true, firstName: true, lastName: true } })
              : Promise.resolve([]),
            dealIds.length
              ? prisma.deal.findMany({ where: { tenantId: jwt.tenantId, id: { in: dealIds } }, select: { id: true, name: true } })
              : Promise.resolve([]),
          ]);
          const accountLabel = new Map(accounts.map((a) => [a.id, a.name]));
          const contactLabel = new Map(contacts.map((c) => [c.id, `${c.firstName} ${c.lastName}`.trim()]));
          const dealLabel = new Map(deals.map((d) => [d.id, d.name]));

          const data = follows.map((f) => ({
            id: f.id,
            entityType: f.entityType,
            entityId: f.entityId,
            label:
              f.entityType === 'account'
                ? accountLabel.get(f.entityId) ?? null
                : f.entityType === 'contact'
                  ? contactLabel.get(f.entityId) ?? null
                  : f.entityType === 'deal'
                    ? dealLabel.get(f.entityId) ?? null
                    : null,
            createdAt: f.createdAt,
          }));
          return reply.send({ success: true, data });
        }
      );

      // ─── ME: personal feed (recent Activity across followed records) ─────
      r.get(
        '/me/feed',
        { preHandler: requirePermission(PERMISSIONS.ACCOUNTS.READ) },
        async (request, reply) => {
          const parsed = FeedQuerySchema.safeParse(request.query);
          const limit = parsed.success ? parsed.data.limit : 50;
          const jwt = request.user as JwtPayload;

          const follows = await prisma.recordFollower.findMany({
            where: { tenantId: jwt.tenantId, userId: jwt.sub },
            select: { entityType: true, entityId: true },
          });
          if (follows.length === 0) return reply.send({ success: true, data: [] });

          const accountIds = follows.filter((f) => f.entityType === 'account').map((f) => f.entityId);
          const contactIds = follows.filter((f) => f.entityType === 'contact').map((f) => f.entityId);
          const dealIds = follows.filter((f) => f.entityType === 'deal').map((f) => f.entityId);

          const orClauses: Array<Record<string, unknown>> = [];
          if (accountIds.length) orClauses.push({ accountId: { in: accountIds } });
          if (contactIds.length) orClauses.push({ contactId: { in: contactIds } });
          if (dealIds.length) orClauses.push({ dealId: { in: dealIds } });
          if (orClauses.length === 0) return reply.send({ success: true, data: [] });

          const activities = await prisma.activity.findMany({
            where: { tenantId: jwt.tenantId, OR: orClauses },
            orderBy: { createdAt: 'desc' },
            take: limit,
          });

          // Minimal record labels for the feed rows.
          const feedAccountIds = [...new Set(activities.map((a) => a.accountId).filter((v): v is string => !!v))];
          const feedContactIds = [...new Set(activities.map((a) => a.contactId).filter((v): v is string => !!v))];
          const feedDealIds = [...new Set(activities.map((a) => a.dealId).filter((v): v is string => !!v))];
          const [accounts, contacts, deals] = await Promise.all([
            feedAccountIds.length
              ? prisma.account.findMany({ where: { tenantId: jwt.tenantId, id: { in: feedAccountIds } }, select: { id: true, name: true } })
              : Promise.resolve([]),
            feedContactIds.length
              ? prisma.contact.findMany({ where: { tenantId: jwt.tenantId, id: { in: feedContactIds } }, select: { id: true, firstName: true, lastName: true } })
              : Promise.resolve([]),
            feedDealIds.length
              ? prisma.deal.findMany({ where: { tenantId: jwt.tenantId, id: { in: feedDealIds } }, select: { id: true, name: true } })
              : Promise.resolve([]),
          ]);
          const accountLabel = new Map(accounts.map((a) => [a.id, a.name]));
          const contactLabel = new Map(contacts.map((c) => [c.id, `${c.firstName} ${c.lastName}`.trim()]));
          const dealLabel = new Map(deals.map((d) => [d.id, d.name]));

          const data = activities.map((a) => ({
            id: a.id,
            type: a.type,
            subject: a.subject,
            description: a.description,
            status: a.status,
            ownerId: a.ownerId,
            accountId: a.accountId,
            contactId: a.contactId,
            dealId: a.dealId,
            recordType: a.accountId ? 'account' : a.contactId ? 'contact' : a.dealId ? 'deal' : null,
            recordLabel: a.accountId
              ? accountLabel.get(a.accountId) ?? null
              : a.contactId
                ? contactLabel.get(a.contactId) ?? null
                : a.dealId
                  ? dealLabel.get(a.dealId) ?? null
                  : null,
            createdAt: a.createdAt,
          }));
          return reply.send({ success: true, data });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
