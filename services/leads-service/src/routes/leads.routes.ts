import type { FastifyInstance } from 'fastify';
import { Prisma } from '../../../../node_modules/.prisma/leads-client/index.js';
import { z } from 'zod';
import type { JwtPayload } from '@nexus/shared-types';
import { toPaginatedResult } from '@nexus/shared-types';
import {
  PERMISSIONS,
  requirePermission,
  ValidationError,
  createHttpClient,
} from '@nexus/service-utils';
import {
  CreateLeadSchema,
  UpdateLeadSchema,
  IdParamSchema,
  LeadListQuerySchema,
} from '@nexus/validation';
import type { LeadsPrisma } from '../prisma.js';
import { createCodingClient } from '@nexus/service-utils';

const codingClient = createCodingClient({ baseURL: process.env.METADATA_SERVICE_URL ?? 'http://localhost:3004' });
const crmClient = createHttpClient({ baseURL: process.env.CRM_SERVICE_URL ?? 'http://localhost:3001' });

function resolveSortField(
  sortBy: string | undefined
): keyof Prisma.LeadOrderByWithRelationInput {
  const allowed = new Set([
    'createdAt',
    'updatedAt',
    'firstName',
    'lastName',
    'score',
    'status',
  ]);
  return (
    (sortBy && allowed.has(sortBy) ? sortBy : 'createdAt') as keyof Prisma.LeadOrderByWithRelationInput
  );
}

const LeadStatusSchema = z.object({
  status: z.enum(['NEW', 'ASSIGNED', 'WORKING', 'QUALIFIED', 'UNQUALIFIED', 'CONVERTED']),
});

/**
 * Registers the `/api/v1/leads/*` route family.
 */
export async function registerLeadsRoutes(
  app: FastifyInstance,
  prisma: LeadsPrisma
): Promise<void> {
  await app.register(
    async (r) => {
      // ─── LIST ───────────────────────────────────────────────────────────
      r.get(
        '/leads',
        { preHandler: requirePermission(PERMISSIONS.LEADS.READ) },
        async (request, reply) => {
          const parsed = LeadListQuerySchema.safeParse(request.query);
          if (!parsed.success) {
            throw new ValidationError('Invalid query', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const q = parsed.data;
          const where: Prisma.LeadWhereInput = { tenantId: jwt.tenantId, deletedAt: null };
          if (q.ownerId) where.ownerId = q.ownerId;
          if (q.status) where.status = q.status;
          if (q.source) where.source = q.source;
          if (q.rating) where.rating = q.rating;
          if (q.search?.trim()) {
            where.OR = [
              { firstName: { contains: q.search.trim(), mode: 'insensitive' } },
              { lastName: { contains: q.search.trim(), mode: 'insensitive' } },
              { email: { contains: q.search.trim(), mode: 'insensitive' } },
              { company: { contains: q.search.trim(), mode: 'insensitive' } },
            ];
          }

          const sortField = resolveSortField(q.sortBy);
          const orderBy: Prisma.LeadOrderByWithRelationInput = {
            [sortField]: q.sortDir ?? 'desc',
          };

          const [leads, total] = await Promise.all([
            prisma.lead.findMany({
              where,
              take: q.limit,
              skip: (q.page - 1) * q.limit,
              orderBy,
            }),
            prisma.lead.count({ where }),
          ]);

          return reply.send({ success: true, data: toPaginatedResult(leads, total, q.page, q.limit) });
        }
      );

      // ─── CREATE ─────────────────────────────────────────────────────────
      r.post(
        '/leads',
        { preHandler: requirePermission(PERMISSIONS.LEADS.CREATE) },
        async (request, reply) => {
          const parsed = CreateLeadSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const code = await codingClient.allocateCode(jwt.tenantId, 'LEAD', { ownerId: parsed.data.ownerId });
          const lead = await prisma.lead.create({
            data: { ...parsed.data, tenantId: jwt.tenantId, code } as Prisma.LeadCreateInput,
          });
          return reply.code(201).send({ success: true, data: lead });
        }
      );

      // ─── READ ───────────────────────────────────────────────────────────
      r.get(
        '/leads/:id',
        { preHandler: requirePermission(PERMISSIONS.LEADS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const lead = await prisma.lead.findFirst({
            where: { id, tenantId: jwt.tenantId, deletedAt: null },
          });
          if (!lead) {
            return reply.code(404).send({
              success: false,
              error: { code: 'NOT_FOUND', message: 'Lead not found', requestId: request.id },
            });
          }
          return reply.send({ success: true, data: lead });
        }
      );

      // ─── UPDATE ─────────────────────────────────────────────────────────
      r.patch(
        '/leads/:id',
        { preHandler: requirePermission(PERMISSIONS.LEADS.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const parsed = UpdateLeadSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const lead = await prisma.lead.update({
            where: { id_tenantId: { id, tenantId: jwt.tenantId } },
            data: parsed.data as Prisma.LeadUpdateInput,
          });
          return reply.send({ success: true, data: lead });
        }
      );

      // ─── UPDATE STATUS ──────────────────────────────────────────────────
      r.patch(
        '/leads/:id/status',
        { preHandler: requirePermission(PERMISSIONS.LEADS.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const parsed = LeadStatusSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const lead = await prisma.lead.update({
            where: { id_tenantId: { id, tenantId: jwt.tenantId } },
            data: { status: parsed.data.status },
          });
          return reply.send({ success: true, data: lead });
        }
      );

      // ─── DELETE (soft) ──────────────────────────────────────────────────
      r.delete(
        '/leads/:id',
        { preHandler: requirePermission(PERMISSIONS.LEADS.DELETE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          await prisma.lead.update({
            where: { id_tenantId: { id, tenantId: jwt.tenantId } },
            data: { deletedAt: new Date() },
          });
          return reply.send({ success: true, data: { id, deleted: true } });
        }
      );

      // ─── CONVERT ────────────────────────────────────────────────────────
      // Lead conversion creates Account + Contact + optional Deal records across
      // multiple domains. The canonical transaction boundary lives in crm-service,
      // so this compatibility route proxies instead of duplicating conversion logic.
      r.post(
        '/leads/:id/convert',
        { preHandler: requirePermission(PERMISSIONS.LEADS.CONVERT) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          try {
            const body = await crmClient.post(`/api/v1/leads/${id}/convert`, request.body ?? {}, {
              authorization: request.headers.authorization ?? '',
              'x-tenant-id': String(request.headers['x-tenant-id'] ?? ''),
            });
            return reply.send(body);
          } catch (err) {
            const statusCode = typeof (err as { statusCode?: unknown }).statusCode === 'number'
              ? (err as { statusCode: number }).statusCode
              : 502;
            return reply.code(statusCode).send({
              success: false,
              error: {
                code: 'CRM_CONVERSION_FAILED',
                message: (err as Error).message,
                requestId: request.id,
              },
            });
          }
        }
      );
    },
    { prefix: process.env.LEADS_SERVICE_API_PREFIX ?? '/api/v1/data' }
  );
}
