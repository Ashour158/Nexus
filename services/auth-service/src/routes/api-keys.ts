import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission, ValidationError } from '@nexus/service-utils';
import { CreateApiKeySchema, IdParamSchema, PaginationSchema } from '@nexus/validation';
import type { AuthPrisma } from '../prisma.js';
import { toPaginatedResult } from '../lib/pagination.js';
import { randomToken, sha256Hex } from '../lib/crypto-utils.js';

/**
 * Registers `/api/v1/api-keys/*` routes (Section 34.1).
 */
export async function registerApiKeysRoutes(
  app: FastifyInstance,
  prisma: AuthPrisma
): Promise<void> {
  await app.register(
    async (r) => {
      r.get(
        '/api-keys',
        { preHandler: requirePermission(PERMISSIONS.INTEGRATIONS.READ) },
        async (request, reply) => {
          const q = PaginationSchema.parse(request.query);
          const jwt = request.user as JwtPayload;
          const where = { tenantId: jwt.tenantId };
          const [total, rows] = await Promise.all([
            prisma.apiKey.count({ where }),
            prisma.apiKey.findMany({
              where,
              skip: (q.page - 1) * q.limit,
              take: q.limit,
              orderBy: { createdAt: 'desc' },
            }),
          ]);
          return reply.send({
            success: true,
            data: toPaginatedResult(rows, total, q.page, q.limit),
          });
        }
      );

      r.post(
        '/api-keys',
        { preHandler: requirePermission(PERMISSIONS.INTEGRATIONS.MANAGE) },
        async (request, reply) => {
          const parsed = CreateApiKeySchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const raw = `nx_${randomToken(24)}`;
          const keyHash = sha256Hex(raw);
          const keyPrefix = raw.slice(0, 12);
          const row = await prisma.apiKey.create({
            data: {
              tenantId: jwt.tenantId,
              name: parsed.data.name,
              keyHash,
              keyPrefix,
              scopes: parsed.data.scopes ?? [],
              expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
            },
          });
          await prisma.auditLog.create({
            data: {
              tenantId: jwt.tenantId,
              userId: jwt.sub,
              action: 'CREATE',
              resource: 'ApiKey',
              resourceId: row.id,
              newValue: { name: row.name, keyPrefix },
              ipAddress: request.ip,
              userAgent: request.headers['user-agent'],
            },
          });
          return reply.code(201).send({
            success: true,
            data: { ...row, key: raw },
          });
        }
      );

      r.delete(
        '/api-keys/:id',
        { preHandler: requirePermission(PERMISSIONS.INTEGRATIONS.MANAGE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          await prisma.apiKey.delete({ where: { id } });
          await prisma.auditLog.create({
            data: {
              tenantId: jwt.tenantId,
              userId: jwt.sub,
              action: 'DELETE',
              resource: 'ApiKey',
              resourceId: id,
              ipAddress: request.ip,
              userAgent: request.headers['user-agent'],
            },
          });
          return reply.send({ success: true, data: { id } });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
