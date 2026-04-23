import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import {
  PERMISSIONS,
  requirePermission,
  ValidationError,
} from '@nexus/service-utils';
import type { NexusProducer } from '@nexus/kafka';
import {
  CreateInvoiceSchema,
  IdParamSchema,
  InvoiceListQuerySchema,
  RecordPaymentSchema,
  UpdateInvoiceSchema,
} from '@nexus/validation';
import type { FinancePrisma } from '../prisma.js';
import { createInvoicesService } from '../services/invoices.service.js';

export async function registerInvoicesRoutes(
  app: FastifyInstance,
  prisma: FinancePrisma,
  producer: NexusProducer
): Promise<void> {
  const invoices = createInvoicesService(prisma, producer);

  await app.register(
    async (r) => {
      r.get(
        '/invoices',
        { preHandler: requirePermission(PERMISSIONS.INVOICES.READ) },
        async (request, reply) => {
          const parsed = InvoiceListQuerySchema.safeParse(request.query);
          if (!parsed.success) {
            throw new ValidationError('Invalid query', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const q = parsed.data;
          const result = await invoices.listInvoices(
            jwt.tenantId,
            {
              accountId: q.accountId,
              status: q.status,
              fromDate: q.fromDate,
              toDate: q.toDate,
              search: q.search,
            },
            { page: q.page, limit: q.limit, sortBy: q.sortBy, sortDir: q.sortDir }
          );
          return reply.send({ success: true, data: result });
        }
      );

      r.post(
        '/invoices',
        { preHandler: requirePermission(PERMISSIONS.INVOICES.CREATE) },
        async (request, reply) => {
          const parsed = CreateInvoiceSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const invoice = await invoices.createInvoice(jwt.tenantId, parsed.data);
          return reply.code(201).send({ success: true, data: invoice });
        }
      );

      r.get(
        '/invoices/:id',
        { preHandler: requirePermission(PERMISSIONS.INVOICES.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const invoice = await invoices.getInvoiceById(jwt.tenantId, id);
          if (!invoice) {
            return reply.code(404).send({
              success: false,
              error: { code: 'NOT_FOUND', message: 'Invoice not found' },
            });
          }
          return reply.send({ success: true, data: invoice });
        }
      );

      r.patch(
        '/invoices/:id',
        { preHandler: requirePermission(PERMISSIONS.INVOICES.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const parsed = UpdateInvoiceSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const invoice = await invoices.updateInvoice(
            jwt.tenantId,
            id,
            parsed.data
          );
          return reply.send({ success: true, data: invoice });
        }
      );

      r.post(
        '/invoices/:id/void',
        { preHandler: requirePermission(PERMISSIONS.INVOICES.VOID) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const invoice = await invoices.voidInvoice(jwt.tenantId, id);
          return reply.send({ success: true, data: invoice });
        }
      );

      r.post(
        '/invoices/:id/payments',
        { preHandler: requirePermission(PERMISSIONS.INVOICES.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const parsed = RecordPaymentSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const payment = await invoices.recordPayment(
            jwt.tenantId,
            id,
            parsed.data
          );
          return reply.code(201).send({ success: true, data: payment });
        }
      );

      r.get(
        '/invoices/:id/payments',
        { preHandler: requirePermission(PERMISSIONS.INVOICES.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const payments = await invoices.listPayments(jwt.tenantId, id);
          return reply.send({ success: true, data: payments });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
