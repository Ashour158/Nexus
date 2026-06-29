import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission, ValidationError } from '@nexus/service-utils';
import {
  CompanyListQuerySchema,
  CreateCompanySchema,
  IdParamSchema,
  UpdateCompanySchema,
} from '@nexus/validation';
import { Prisma } from '../../../../node_modules/.prisma/crm-client/index.js';
import type { CrmPrisma } from '../prisma.js';

const VALID_ACCOUNT_TYPES = new Set([
  'PROSPECT',
  'CUSTOMER',
  'PARTNER',
  'COMPETITOR',
  'RESELLER',
  'OTHER',
]);

export async function registerCompaniesRoutes(
  app: FastifyInstance,
  prisma: CrmPrisma
): Promise<void> {
  await app.register(
    async (r) => {
      r.get(
        '/companies',
        { preHandler: requirePermission(PERMISSIONS.ACCOUNTS.READ) },
        async (request, reply) => {
          const parsed = CompanyListQuerySchema.safeParse(request.query);
          if (!parsed.success) throw new ValidationError('Invalid query', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const q = parsed.data;

          const where: Record<string, unknown> = { tenantId: jwt.tenantId };
          if (q.ownerId) where.ownerId = q.ownerId;
          if (q.type) where.type = VALID_ACCOUNT_TYPES.has(q.type) ? q.type : undefined;
          if (q.industry) where.industry = { contains: q.industry, mode: 'insensitive' };
          if (q.isActive !== undefined) {
            where.status = q.isActive ? 'ACTIVE' : 'INACTIVE';
          }
          if (q.search?.trim()) {
            const s = q.search.trim();
            where.OR = [
              { name: { contains: s, mode: 'insensitive' } },
              { email: { contains: s, mode: 'insensitive' } },
              { website: { contains: s, mode: 'insensitive' } },
            ];
          }

          const [total, rows] = await Promise.all([
            prisma.account.count({ where }),
            prisma.account.findMany({
              where,
              skip: (q.page - 1) * q.limit,
              take: q.limit,
              orderBy: { createdAt: 'desc' },
            }),
          ]);
          return reply.send({ success: true, data: { rows, total, page: q.page, limit: q.limit } });
        }
      );

      r.post(
        '/companies',
        { preHandler: requirePermission(PERMISSIONS.ACCOUNTS.CREATE) },
        async (request, reply) => {
          const parsed = CreateCompanySchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const data = parsed.data;

          const customFields: Record<string, unknown> = { ...(data.customFields ?? {}) };
          if (data.size) customFields.size = data.size;

          const company = await prisma.account.create({
            data: {
              tenantId: jwt.tenantId,
              ownerId: data.ownerId,
              name: data.name,
              website: data.website ?? null,
              phone: data.phone ?? null,
              email: data.email ?? null,
              industry: data.industry ?? null,
              type: (data.type && VALID_ACCOUNT_TYPES.has(data.type) ? data.type : 'PROSPECT') as any,
              annualRevenue: data.annualRevenue ? new Prisma.Decimal(data.annualRevenue) : null,
              employeeCount: data.employeeCount ?? null,
              country: data.country ?? null,
              city: data.city ?? null,
              address: data.address ?? null,
              zipCode: data.zipCode ?? null,
              linkedInUrl: data.linkedInUrl ?? null,
              description: data.description ?? null,
              customFields: customFields as Prisma.InputJsonValue,
              tags: data.tags,
            },
          });
          return reply.code(201).send({ success: true, data: company });
        }
      );

      r.get(
        '/companies/:id',
        { preHandler: requirePermission(PERMISSIONS.ACCOUNTS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const company = await prisma.account.findFirst({ where: { id, tenantId: jwt.tenantId } });
          if (!company) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Not found', requestId: request.id } });
          return reply.send({ success: true, data: company });
        }
      );

      r.patch(
        '/companies/:id',
        { preHandler: requirePermission(PERMISSIONS.ACCOUNTS.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const parsed = UpdateCompanySchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const data = parsed.data;

          const existing = await prisma.account.findFirst({ where: { id, tenantId: jwt.tenantId } });
          if (!existing) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Not found', requestId: request.id } });

          const update: Record<string, unknown> = {};
          const scalarFields = [
            'name', 'website', 'phone', 'email', 'industry', 'type',
            'employeeCount', 'country', 'city', 'address', 'zipCode', 'linkedInUrl',
            'description', 'ownerId',
          ] as const;
          for (const f of scalarFields) {
            if ((data as Record<string, unknown>)[f] !== undefined) update[f] = (data as Record<string, unknown>)[f];
          }
          if (data.type && VALID_ACCOUNT_TYPES.has(data.type)) update.type = data.type;
          if (data.isActive !== undefined) update.status = data.isActive ? 'ACTIVE' : 'INACTIVE';
          if (data.annualRevenue !== undefined) update.annualRevenue = new Prisma.Decimal(data.annualRevenue);
          if (data.customFields !== undefined) {
            const customFields: Record<string, unknown> = { ...(data.customFields ?? {}) };
            if (data.size) customFields.size = data.size;
            update.customFields = customFields as Prisma.InputJsonValue;
          } else if (data.size !== undefined) {
            const customFields: Record<string, unknown> = { ...(existing.customFields as object ?? {}) };
            customFields.size = data.size;
            update.customFields = customFields as Prisma.InputJsonValue;
          }
          if (data.tags !== undefined) update.tags = data.tags;

          const company = await prisma.account.update({ where: { id }, data: update });
          return reply.send({ success: true, data: company });
        }
      );

      r.delete(
        '/companies/:id',
        { preHandler: requirePermission(PERMISSIONS.ACCOUNTS.DELETE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const existing = await prisma.account.findFirst({ where: { id, tenantId: jwt.tenantId } });
          if (!existing) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Not found', requestId: request.id } });
          await prisma.account.update({ where: { id }, data: { deletedAt: new Date() } });
          return reply.send({ success: true, data: { id, deleted: true } });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
