import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import {
  PERMISSIONS,
  requirePermission,
  ValidationError,
} from '@nexus/service-utils';
import type { NexusProducer } from '@nexus/kafka';
import {
  ConvertLeadSchema,
  CreateLeadSchema,
  IdParamSchema,
  LeadListQuerySchema,
  UpdateLeadSchema,
} from '@nexus/validation';
import type { CrmPrisma } from '../prisma.js';
import { createLeadsService } from '../services/leads.service.js';

/**
 * Registers the `/api/v1/leads/*` route family — Section 34.2 → "Leads".
 */
export async function registerLeadsRoutes(
  app: FastifyInstance,
  prisma: CrmPrisma,
  producer: NexusProducer
): Promise<void> {
  const leads = createLeadsService(prisma, producer);

  await app.register(
    async (r) => {
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
          const result = await leads.listLeads(
            jwt.tenantId,
            {
              ownerId: q.ownerId,
              status: q.status,
              source: q.source,
              rating: q.rating,
              search: q.search,
            },
            { page: q.page, limit: q.limit, sortBy: q.sortBy, sortDir: q.sortDir }
          );
          return reply.send({ success: true, data: result });
        }
      );

      r.post(
        '/leads',
        { preHandler: requirePermission(PERMISSIONS.LEADS.CREATE) },
        async (request, reply) => {
          const parsed = CreateLeadSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const lead = await leads.createLead(jwt.tenantId, parsed.data);
          return reply.code(201).send({ success: true, data: lead });
        }
      );

      r.post(
        '/leads/:id/convert',
        { preHandler: requirePermission(PERMISSIONS.LEADS.CONVERT) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const parsed = ConvertLeadSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const result = await leads.convertLead(jwt.tenantId, id, parsed.data);
          return reply.send({ success: true, data: result });
        }
      );

      r.get(
        '/leads/:id',
        { preHandler: requirePermission(PERMISSIONS.LEADS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const lead = await leads.getLeadById(jwt.tenantId, id);
          return reply.send({ success: true, data: lead });
        }
      );

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
          const lead = await leads.updateLead(jwt.tenantId, id, parsed.data);
          return reply.send({ success: true, data: lead });
        }
      );

      r.delete(
        '/leads/:id',
        { preHandler: requirePermission(PERMISSIONS.LEADS.DELETE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          await leads.deleteLead(jwt.tenantId, id);
          return reply.send({ success: true, data: { id, deleted: true } });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
