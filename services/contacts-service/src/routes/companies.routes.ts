import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission, ValidationError } from '@nexus/service-utils';
import {
  CompanyListQuerySchema,
  CreateCompanySchema,
  IdParamSchema,
  UpdateCompanySchema,
} from '@nexus/validation';
import type { ContactsPrisma } from '../prisma.js';
import { createCompaniesService } from '../services/companies.service.js';

export async function registerCompaniesRoutes(
  app: FastifyInstance,
  prisma: ContactsPrisma
): Promise<void> {
  const companies = createCompaniesService(prisma);

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
          const result = await companies.listCompanies(jwt.tenantId, { ownerId: q.ownerId, type: q.type, industry: q.industry, search: q.search, isActive: q.isActive }, { page: q.page, limit: q.limit, sortBy: q.sortBy, sortDir: q.sortDir });
          return reply.send({ success: true, data: result });
        }
      );

      r.post(
        '/companies',
        { preHandler: requirePermission(PERMISSIONS.ACCOUNTS.CREATE) },
        async (request, reply) => {
          const parsed = CreateCompanySchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const company = await companies.createCompany(jwt.tenantId, parsed.data);
          return reply.code(201).send({ success: true, data: company });
        }
      );

      r.get(
        '/companies/:id',
        { preHandler: requirePermission(PERMISSIONS.ACCOUNTS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const company = await companies.getCompanyById(jwt.tenantId, id);
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
          const company = await companies.updateCompany(jwt.tenantId, id, parsed.data);
          return reply.send({ success: true, data: company });
        }
      );

      r.delete(
        '/companies/:id',
        { preHandler: requirePermission(PERMISSIONS.ACCOUNTS.DELETE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          await companies.deleteCompany(jwt.tenantId, id);
          return reply.send({ success: true, data: { id, deleted: true } });
        }
      );
    },
    { prefix: process.env.CONTACTS_SERVICE_API_PREFIX ?? '/api/v1/data' }
  );
}
