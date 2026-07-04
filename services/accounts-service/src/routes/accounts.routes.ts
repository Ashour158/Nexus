import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import { toPaginatedResult } from '@nexus/shared-types';
import {
  PERMISSIONS,
  requirePermission,
  ValidationError,
} from '@nexus/service-utils';
import {
  CreateAccountSchema,
  UpdateAccountSchema,
  IdParamSchema,
  AccountListQuerySchema,
} from '@nexus/validation';
import type { AccountsPrisma } from '../prisma.js';
import type { Prisma, AccountType, AccountTier, AccountStatus } from '../../../../node_modules/.prisma/accounts-client/index.js';
import { createCodingClient } from '@nexus/service-utils';

const codingClient = createCodingClient({ baseURL: process.env.METADATA_SERVICE_URL ?? 'http://localhost:3004' });

/** Lightweight projection returned for each node in a hierarchy response. */
const HIERARCHY_NODE_SELECT = {
  id: true,
  name: true,
  parentAccountId: true,
  type: true,
  status: true,
} as const;

interface HierarchyNode {
  id: string;
  name: string;
  parentAccountId: string | null;
  type: AccountType;
  status: AccountStatus;
}

interface HierarchyTreeNode extends HierarchyNode {
  childrenCount: number;
  children: HierarchyTreeNode[];
}

/**
 * Registers the standalone accounts route family.
 */
export async function registerAccountsRoutes(
  app: FastifyInstance,
  prisma: AccountsPrisma
): Promise<void> {
  await app.register(
    async (r) => {
      // ─── LIST ───────────────────────────────────────────────────────────
      r.get(
        '/accounts',
        { preHandler: requirePermission(PERMISSIONS.ACCOUNTS.READ) },
        async (request, reply) => {
          const parsed = AccountListQuerySchema.safeParse(request.query);
          if (!parsed.success) {
            throw new ValidationError('Invalid query', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const q = parsed.data;
          const where: Prisma.AccountWhereInput = { tenantId: jwt.tenantId, deletedAt: null };
          if (q.ownerId) where.ownerId = q.ownerId;
          if (q.type) where.type = q.type as AccountType;
          if (q.tier) where.tier = q.tier as AccountTier;
          if (q.status) where.status = q.status as AccountStatus;
          if (q.industry) where.industry = q.industry;
          if (q.search?.trim()) {
            where.OR = [
              { name: { contains: q.search.trim(), mode: 'insensitive' } },
              { email: { contains: q.search.trim(), mode: 'insensitive' } },
            ];
          }

          const orderBy: Record<string, 'asc' | 'desc'> = {};
          if (q.sortBy) {
            orderBy[q.sortBy] = q.sortDir ?? 'desc';
          } else {
            orderBy.createdAt = 'desc';
          }

          const [accounts, total] = await Promise.all([
            prisma.account.findMany({
              where,
              take: q.limit,
              skip: (q.page - 1) * q.limit,
              orderBy,
            }),
            prisma.account.count({ where }),
          ]);

          return reply.send({ success: true, data: toPaginatedResult(accounts, total, q.page, q.limit) });
        }
      );

      // ─── CREATE ─────────────────────────────────────────────────────────
      r.post(
        '/accounts',
        { preHandler: requirePermission(PERMISSIONS.ACCOUNTS.CREATE) },
        async (request, reply) => {
          const parsed = CreateAccountSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const code = parsed.data.code ?? await codingClient.allocateCode(jwt.tenantId, 'ACCOUNT', { ownerId: parsed.data.ownerId });
          const account = await prisma.account.create({
            data: { ...parsed.data, tenantId: jwt.tenantId, code },
          });
          return reply.code(201).send({ success: true, data: account });
        }
      );

      // ─── READ ───────────────────────────────────────────────────────────
      r.get(
        '/accounts/:id',
        { preHandler: requirePermission(PERMISSIONS.ACCOUNTS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const account = await prisma.account.findFirst({
            where: { id, tenantId: jwt.tenantId, deletedAt: null },
          });
          if (!account) {
            return reply.code(404).send({
              success: false,
              error: { code: 'NOT_FOUND', message: 'Account not found', requestId: request.id },
            });
          }
          return reply.send({ success: true, data: account });
        }
      );

      // ─── HIERARCHY: parent + direct children ────────────────────────────
      r.get(
        '/accounts/:id/hierarchy',
        { preHandler: requirePermission(PERMISSIONS.ACCOUNTS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const tenantId = jwt.tenantId;

          const root = await prisma.account.findFirst({
            where: { id, tenantId, deletedAt: null },
          });
          if (!root) {
            return reply.code(404).send({
              success: false,
              error: { code: 'NOT_FOUND', message: 'Account not found', requestId: request.id },
            });
          }

          const parent = root.parentAccountId
            ? await prisma.account.findFirst({
                where: { id: root.parentAccountId, tenantId, deletedAt: null },
                select: HIERARCHY_NODE_SELECT,
              })
            : null;

          // Depth cap guards against cycles / pathological trees. We resolve the
          // subtree breadth-first, one level per query, never revisiting an id.
          const MAX_DEPTH = 10;
          const visited = new Set<string>([root.id]);
          const nodesById = new Map<string, HierarchyNode>();
          const childrenByParent = new Map<string, HierarchyNode[]>();

          let frontier: string[] = [root.id];
          let depth = 0;
          let truncated = false;

          while (frontier.length > 0) {
            if (depth >= MAX_DEPTH) {
              truncated = true;
              break;
            }
            const children = await prisma.account.findMany({
              where: { tenantId, deletedAt: null, parentAccountId: { in: frontier } },
              select: HIERARCHY_NODE_SELECT,
            });
            const next: string[] = [];
            for (const child of children) {
              if (visited.has(child.id)) continue; // cycle guard
              visited.add(child.id);
              nodesById.set(child.id, child);
              const bucket = childrenByParent.get(child.parentAccountId!) ?? [];
              bucket.push(child);
              childrenByParent.set(child.parentAccountId!, bucket);
              next.push(child.id);
            }
            frontier = next;
            depth += 1;
          }

          // Aggregate local pipeline roll-up from health records across the subtree.
          const subtreeIds = [root.id, ...nodesById.keys()];
          const healthRows = await prisma.accountHealthScore.findMany({
            where: { tenantId, accountId: { in: subtreeIds } },
            select: { accountId: true, openDealsCount: true, wonDealsCount: true, lostDealsCount: true },
          });
          const rollup = healthRows.reduce(
            (acc, h) => {
              acc.openDealsCount += h.openDealsCount;
              acc.wonDealsCount += h.wonDealsCount;
              acc.lostDealsCount += h.lostDealsCount;
              return acc;
            },
            { openDealsCount: 0, wonDealsCount: 0, lostDealsCount: 0 }
          );

          const buildSubtree = (node: HierarchyNode): HierarchyTreeNode => {
            const kids = childrenByParent.get(node.id) ?? [];
            return {
              ...node,
              childrenCount: kids.length,
              children: kids.map(buildSubtree),
            };
          };

          const rootChildren = childrenByParent.get(root.id) ?? [];
          const subtree: HierarchyTreeNode = {
            id: root.id,
            name: root.name,
            parentAccountId: root.parentAccountId,
            type: root.type,
            status: root.status,
            childrenCount: rootChildren.length,
            children: rootChildren.map(buildSubtree),
          };

          return reply.send({
            success: true,
            data: {
              account: subtree,
              parent,
              totalDescendants: nodesById.size,
              maxDepth: MAX_DEPTH,
              truncated,
              pipelineRollup: rollup,
            },
          });
        }
      );

      // ─── HIERARCHY: direct children only ────────────────────────────────
      r.get(
        '/accounts/:id/children',
        { preHandler: requirePermission(PERMISSIONS.ACCOUNTS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const tenantId = jwt.tenantId;

          const parentExists = await prisma.account.findFirst({
            where: { id, tenantId, deletedAt: null },
            select: { id: true },
          });
          if (!parentExists) {
            return reply.code(404).send({
              success: false,
              error: { code: 'NOT_FOUND', message: 'Account not found', requestId: request.id },
            });
          }

          const children = await prisma.account.findMany({
            where: { tenantId, deletedAt: null, parentAccountId: id },
            select: HIERARCHY_NODE_SELECT,
            orderBy: { name: 'asc' },
          });

          return reply.send({
            success: true,
            data: { children, childrenCount: children.length },
          });
        }
      );

      // ─── UPDATE ─────────────────────────────────────────────────────────
      r.patch(
        '/accounts/:id',
        { preHandler: requirePermission(PERMISSIONS.ACCOUNTS.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const parsed = UpdateAccountSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const account = await prisma.account.update({
            where: { id_tenantId: { id, tenantId: jwt.tenantId } },
            data: parsed.data,
          });
          return reply.send({ success: true, data: account });
        }
      );

      // ─── DELETE (soft) ──────────────────────────────────────────────────
      r.delete(
        '/accounts/:id',
        { preHandler: requirePermission(PERMISSIONS.ACCOUNTS.DELETE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          await prisma.account.update({
            where: { id_tenantId: { id, tenantId: jwt.tenantId } },
            data: { deletedAt: new Date() },
          });
          return reply.send({ success: true, data: { id, deleted: true } });
        }
      );
    },
    { prefix: process.env.ACCOUNTS_SERVICE_API_PREFIX ?? '/api/v1/data' }
  );
}
