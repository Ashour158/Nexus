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
