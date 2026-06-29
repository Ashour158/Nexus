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
import { buildInvoiceHTML, generatePDF } from '../lib/pdf-generator.js';

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

      r.get(
        '/invoices/:id/pdf',
        { preHandler: requirePermission(PERMISSIONS.INVOICES.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const invoice = await prisma.invoice.findFirst({
            where: { id, tenantId: jwt.tenantId },
          });
          if (!invoice) {
            return reply.code(404).send({
              success: false,
              error: { code: 'NOT_FOUND', message: 'Invoice not found' },
            });
          }

          const lineItemsRaw = Array.isArray(invoice.lineItems)
            ? (invoice.lineItems as unknown[])
            : [];
          const lineItems = lineItemsRaw.map((item) => {
            const it = item as Record<string, unknown>;
            return {
              description: String(it.description ?? 'Line item'),
              qty: Number(it.quantity ?? it.qty ?? 1),
              unitPrice: Number(it.unitPrice ?? 0),
              total: Number(it.total ?? 0),
              taxRate: it.taxRate != null ? Number(it.taxRate) : undefined,
              taxAmount: it.taxAmount != null ? Number(it.taxAmount) : undefined,
            };
          });
          const aggregatedTax = lineItems.reduce((sum, it) => sum + (it.taxAmount ?? 0), 0);
          const taxBreakdown = aggregatedTax
            ? [{ taxName: 'VAT', rate: 15, amount: aggregatedTax }]
            : [];

          const cf = (invoice.customFields ?? {}) as Record<string, unknown>;
          const french = (cf.frenchInvoice as
            | {
                siret?: string;
                apeCode?: string;
                capitalSocial?: string;
                rcs?: string;
                legalForm?: string;
                vatNumber?: string;
                paymentTermsText?: string;
                latePaymentPenalty?: string;
              }
            | undefined) ?? {};

          const html = buildInvoiceHTML({
            invoiceNumber: invoice.invoiceNumber,
            issueDate: invoice.createdAt.toLocaleDateString('en-GB'),
            dueDate: invoice.dueDate
              ? invoice.dueDate.toLocaleDateString('en-GB')
              : 'Upon receipt',
            currency: invoice.currency || 'USD',
            vendor: {
              name: 'NEXUS CRM',
              address: '',
            },
            buyer: {
              name: invoice.accountId,
              address: '',
            },
            lineItems,
            subtotal: Number(invoice.subtotal),
            taxBreakdown,
            totalTax: Number(invoice.taxAmount ?? 0),
            grandTotal: Number(invoice.total),
            notes: invoice.notes ?? undefined,
            paymentTerms: undefined,
            siret: french.siret,
            apeCode: french.apeCode,
            capitalSocial: french.capitalSocial,
            rcs: french.rcs,
            legalForm: french.legalForm,
            vatNumber: french.vatNumber,
            paymentTermsText: french.paymentTermsText,
            latePaymentPenalty: french.latePaymentPenalty,
          });

          const pdf = await generatePDF(html);
          reply.header('Content-Type', 'application/pdf');
          reply.header('Content-Disposition', `attachment; filename="${invoice.invoiceNumber}.pdf"`);
          return reply.send(pdf);
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
        '/invoices/:id/send',
        { preHandler: requirePermission(PERMISSIONS.INVOICES.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const invoice = await invoices.sendInvoice(jwt.tenantId, id);
          return reply.send({ success: true, data: invoice });
        }
      );

      r.post(
        '/invoices/:id/mark-paid',
        { preHandler: requirePermission(PERMISSIONS.INVOICES.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const invoice = await invoices.markPaid(jwt.tenantId, id);
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
