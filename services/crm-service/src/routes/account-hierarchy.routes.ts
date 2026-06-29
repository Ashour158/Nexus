import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { CrmPrisma } from '../prisma.js';

/** Nested childAccounts (three levels) with roll-up counts at each node */
const HIERARCHY_ACCOUNT_INCLUDE = {
  childAccounts: {
    include: {
      childAccounts: {
        include: {
          childAccounts: {
            include: {
              _count: { select: { deals: true, contacts: true, childAccounts: true } },
            },
            _count: { select: { deals: true, contacts: true, childAccounts: true } },
          },
          _count: { select: { deals: true, contacts: true, childAccounts: true } },
        },
        _count: { select: { deals: true, contacts: true, childAccounts: true } },
      },
      _count: { select: { deals: true, contacts: true, childAccounts: true } },
    },
    _count: { select: { deals: true, contacts: true, childAccounts: true } },
  },
  parentAccount: true,
  _count: { select: { deals: true, contacts: true, childAccounts: true } },
} as const;

/** Max depth guard to prevent runaway recursion on malformed data */
const MAX_HIERARCHY_DEPTH = 10;

type RawAccountTree = Record<string, unknown> & {
  childAccounts?: RawAccountTree[];
};

function mapToChildren(account: RawAccountTree, depth = 0): RawAccountTree {
  if (depth > MAX_HIERARCHY_DEPTH) {
    return { ...account, children: [], _count: { deals: 0, contacts: 0, children: 0 } };
  }
  const raw = account.childAccounts;
  const childAccounts =
    raw && Array.isArray(raw) ? (raw as RawAccountTree[]).map((c) => mapToChildren(c, depth + 1)) : [];
  const { childAccounts: _drop, _count, ...rest } = account;
  const cnt = _count as { deals?: number; contacts?: number; childAccounts?: number } | undefined;
  return {
    ...rest,
    children: childAccounts,
    _count: cnt
      ? {
          deals: cnt.deals ?? 0,
          contacts: cnt.contacts ?? 0,
          children: cnt.childAccounts ?? 0,
        }
      : _count,
  };
}

async function rollupValues(prisma: CrmPrisma, tenantId: string, acctId: string) {
  // BFS to collect all descendant account IDs in one pass to avoid recursive N+1
  const allIds: string[] = [acctId];
  const queue: string[] = [acctId];
  while (queue.length > 0) {
    const batch = queue.splice(0, queue.length);
    const children = await prisma.account.findMany({
      where: { tenantId, parentAccountId: { in: batch } },
      select: { id: true },
    });
    for (const c of children) {
      allIds.push(c.id);
      queue.push(c.id);
    }
  }

  const [agg] = await Promise.all([
    prisma.deal.aggregate({
      where: {
        tenantId,
        accountId: { in: allIds },
        status: { not: 'LOST' },
      },
      _sum: { amount: true },
      _count: true,
    }),
  ]);

  const directResult = await prisma.deal.aggregate({
    where: { tenantId, accountId: acctId, status: { not: 'LOST' } },
    _sum: { amount: true },
    _count: true,
  });

  return {
    totalValue: (agg._sum.amount?.toNumber() ?? 0),
    dealCount: agg._count,
    directValue: directResult._sum.amount?.toNumber() ?? 0,
    directDealCount: directResult._count,
  };
}

/**
 * Account hierarchy — register **before** `registerAccountsRoutes` so `/accounts/roots`
 * is not captured by `/accounts/:id`.
 */
export async function registerAccountHierarchyRoutes(
  app: FastifyInstance,
  prisma: CrmPrisma
): Promise<void> {
  await app.register(
    async (r) => {
      r.get(
        '/accounts/roots',
        { preHandler: requirePermission(PERMISSIONS.ACCOUNTS.READ) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const roots = await prisma.account.findMany({
            where: { tenantId: jwt.tenantId, parentAccountId: null },
            include: {
              childAccounts: {
                orderBy: { name: 'asc' },
                include: {
                  _count: { select: { deals: true, contacts: true, childAccounts: true } },
                },
              },
              _count: { select: { deals: true, contacts: true, childAccounts: true } },
            },
            orderBy: { name: 'asc' },
          });
          const data = roots.map((a) => {
            const mapped = mapToChildren(a as RawAccountTree);
            return mapped;
          });
          return reply.send({ success: true, data });
        }
      );

      r.get(
        '/accounts/:id/hierarchy',
        { preHandler: requirePermission(PERMISSIONS.ACCOUNTS.READ) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { id } = request.params as { id: string };
          const account = await prisma.account.findFirst({
            where: { id, tenantId: jwt.tenantId },
            include: HIERARCHY_ACCOUNT_INCLUDE,
          });

          if (!account) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Not found', requestId: request.id } });

          const rollup = await rollupValues(prisma, jwt.tenantId, id);
          const shaped = mapToChildren(account as RawAccountTree);
          return reply.send({ success: true, data: { ...shaped, rollup } });
        }
      );

      r.patch(
        '/accounts/:id/parent',
        { preHandler: requirePermission(PERMISSIONS.ACCOUNTS.UPDATE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { id } = request.params as { id: string };
          const body = request.body as { parentId?: string | null; parentAccountId?: string | null };
          const nextParentRaw = body.parentId ?? body.parentAccountId;
          const nextParent = nextParentRaw === undefined ? undefined : nextParentRaw;

          if (nextParent === id) {
            return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Account cannot be its own parent', requestId: request.id } });
          }

          if (typeof nextParent === 'string') {
            const parentRow = await prisma.account.findFirst({
              where: { id: nextParent, tenantId: jwt.tenantId },
            });
            if (!parentRow)
              return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Parent account not found', requestId: request.id } });

            let cur: string | null = nextParent;
            let depth = 0;
            while (cur && depth < 50) {
              if (cur === id) {
                return reply
                  .code(400)
                  .send({ success: false, error: 'Circular account hierarchy not allowed' });
              }
              const acct: { parentAccountId: string | null } | null = await prisma.account.findFirst({
                where: { id: cur, tenantId: jwt.tenantId },
                select: { parentAccountId: true },
              });
              cur = acct?.parentAccountId ?? null;
              depth++;
            }
          }

          const exists = await prisma.account.findFirst({
            where: { id, tenantId: jwt.tenantId },
          });
          if (!exists) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Not found', requestId: request.id } });

          await prisma.account.update({
            where: { id },
            data: {
              parentAccountId: nextParent === undefined ? undefined : nextParent ?? null,
            },
          });
          return reply.send({ success: true });
        }
      );

      r.get(
        '/accounts/:id/children',
        { preHandler: requirePermission(PERMISSIONS.ACCOUNTS.READ) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { id } = request.params as { id: string };
          const children = await prisma.account.findMany({
            where: { tenantId: jwt.tenantId, parentAccountId: id },
            include: { _count: { select: { deals: true, contacts: true, childAccounts: true } } },
            orderBy: { name: 'asc' },
          });
          return reply.send({ success: true, data: children });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
