import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import {
  PERMISSIONS,
  requirePermission,
} from '@nexus/service-utils';
import { Prisma } from '../../../../node_modules/.prisma/finance-client/index.js';
import type { FinancePrisma } from '../prisma.js';
import { submitToZatca, type ZatcaInvoice } from '../lib/zatca.js';

function parseLineItemsFromInvoiceJson(lineItems: unknown): ZatcaInvoice['lineItems'] {
  const arr = Array.isArray(lineItems) ? lineItems : [];
  return arr.map((row) => {
    const it = row as Record<string, unknown>;
    const qty = Number(it.quantity ?? it.qty ?? 1);
    const unitPrice = Number(it.unitPrice ?? 0);
    const lineTotal = Number(it.total ?? it.lineTotal ?? qty * unitPrice);
    const vatAmount = Number(it.vatAmount ?? 0);
    const vatRate = Number(it.vatRate ?? 0.15);
    return {
      description: String(it.description ?? 'Line item'),
      quantity: qty,
      unitPrice,
      vatRate,
      vatAmount,
      lineTotal,
    };
  });
}

export async function registerZatcaRoutes(app: FastifyInstance, prisma: FinancePrisma): Promise<void> {
  app.post(
    '/api/v1/invoices/:id/zatca/submit',
    { preHandler: requirePermission(PERMISSIONS.INVOICES.UPDATE) },
    async (request, reply) => {
      const jwt = request.user as JwtPayload;
      const tenantId = jwt.tenantId;
      const { id } = request.params as { id: string };

      const invoice = await prisma.invoice.findFirst({
        where: { id, tenantId },
      });
      if (!invoice) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Invoice not found', requestId: request.id } });

      const cf = (invoice.customFields as Record<string, unknown>) ?? {};
      const buyer = (cf.buyer as { name?: string; trn?: string } | undefined) ?? {};

      const zatcaInvoice: ZatcaInvoice = {
        invoiceId: invoice.id,
        tenantId,
        invoiceNumber: invoice.invoiceNumber,
        issueDate: invoice.createdAt.toISOString().split('T')[0],
        issueTime: invoice.createdAt.toISOString().split('T')[1].slice(0, 8),
        invoiceType: 'STANDARD',
        currency: invoice.currency ?? 'SAR',
        sellerName: process.env.ZATCA_SELLER_NAME ?? 'NEXUS Company',
        sellerTrn: process.env.ZATCA_SELLER_TRN ?? '000000000000000',
        buyerName: buyer.name ?? invoice.accountId ?? 'Customer',
        buyerTrn: buyer.trn,
        lineItems: parseLineItemsFromInvoiceJson(invoice.lineItems),
        subtotal: Number(invoice.subtotal ?? 0),
        vatTotal: Number(invoice.taxAmount ?? 0),
        total: Number(invoice.total ?? 0),
      };

      const result = await submitToZatca(zatcaInvoice);

      await prisma.zatcaSubmission.upsert({
        where: { invoiceId: id },
        create: {
          tenantId,
          invoiceId: id,
          invoiceNumber: zatcaInvoice.invoiceNumber,
          status: result.status,
          clearanceStatus: result.clearanceStatus ?? null,
          zatcaUuid: result.zatcaUuid ?? null,
          qrCode: result.qrCode ?? null,
          invoiceHash: result.invoiceHash ?? null,
          warnings: result.warnings as Prisma.InputJsonValue,
          errors: result.errors as Prisma.InputJsonValue,
        },
        update: {
          status: result.status,
          clearanceStatus: result.clearanceStatus ?? null,
          zatcaUuid: result.zatcaUuid ?? null,
          qrCode: result.qrCode ?? null,
          invoiceHash: result.invoiceHash ?? null,
          warnings: result.warnings as Prisma.InputJsonValue,
          errors: result.errors as Prisma.InputJsonValue,
          retryCount: { increment: 1 },
        },
      });

      if (result.status === 'ERROR' || result.status === 'NOT_COMPLIANT') {
        return reply.code(422).send({
          success: false,
          data: result,
          error: result.errors?.join('; '),
        });
      }

      return reply.send({ success: true, data: result });
    }
  );

  app.get(
    '/api/v1/invoices/:id/zatca/status',
    { preHandler: requirePermission(PERMISSIONS.INVOICES.READ) },
    async (request, reply) => {
      const jwt = request.user as JwtPayload;
      const { id } = request.params as { id: string };
      const submission = await prisma.zatcaSubmission.findFirst({
        where: { invoiceId: id, tenantId: jwt.tenantId },
      });
      if (!submission)
        return reply.send({ success: true, data: { status: 'NOT_SUBMITTED' } });
      return reply.send({ success: true, data: submission });
    }
  );

  app.get(
    '/api/v1/zatca/submissions',
    { preHandler: requirePermission(PERMISSIONS.INVOICES.READ) },
    async (request, reply) => {
      const jwt = request.user as JwtPayload;
      const { status } = request.query as { status?: string };
      const submissions = await prisma.zatcaSubmission.findMany({
        where: { tenantId: jwt.tenantId, ...(status ? { status } : {}) },
        orderBy: { submittedAt: 'desc' },
        take: 100,
      });
      return reply.send({ success: true, data: submissions });
    }
  );
}
