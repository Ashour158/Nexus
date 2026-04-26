import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, ValidationError, requirePermission } from '@nexus/service-utils';
import { GenerateInvoiceSchema, IdParamSchema, PaginationSchema } from '@nexus/validation';
import type { createBillingInvoicesService } from '../services/invoices.service.js';

export async function registerInvoicesRoutes(
  app: FastifyInstance,
  invoices: ReturnType<typeof createBillingInvoicesService>
): Promise<void> {
  await app.register(
    async (r) => {
      r.get(
        '/billing/invoices',
        { preHandler: requirePermission(PERMISSIONS.BILLING.READ) },
        async (request, reply) => {
          const q = PaginationSchema.parse(request.query);
          const jwt = request.user as JwtPayload;
          const result = await invoices.listInvoices(jwt.tenantId, { page: q.page, limit: q.limit });
          return reply.send({ success: true, data: result });
        }
      );

      r.get(
        '/billing/invoices/:id',
        { preHandler: requirePermission(PERMISSIONS.BILLING.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const row = await invoices.getInvoice(jwt.tenantId, id);
          return reply.send({ success: true, data: row });
        }
      );

      r.post(
        '/billing/invoices/generate',
        { preHandler: requirePermission(PERMISSIONS.BILLING.MANAGE) },
        async (request, reply) => {
          const parsed = GenerateInvoiceSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const row = await invoices.generateInvoice(jwt.tenantId, parsed.data.subscriptionId);
          return reply.code(201).send({ success: true, data: row });
        }
      );

      r.post(
        '/billing/invoices/:id/mark-paid',
        { preHandler: requirePermission(PERMISSIONS.BILLING.MANAGE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const row = await invoices.markPaid(jwt.tenantId, id);
          return reply.send({ success: true, data: row });
        }
      );

      r.post(
        '/billing/invoices/:id/void',
        { preHandler: requirePermission(PERMISSIONS.BILLING.MANAGE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const row = await invoices.voidInvoice(jwt.tenantId, id);
          return reply.send({ success: true, data: row });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
