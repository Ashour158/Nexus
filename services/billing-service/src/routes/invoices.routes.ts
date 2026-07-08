import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@nexus/shared-types';
import {
  PERMISSIONS,
  requirePermission,
  NotFoundError,
  ValidationError,
  BusinessRuleError,
} from '@nexus/service-utils';
import type { BillingPrisma } from '../prisma.js';
import { computeInvoiceBalance } from '../lib/billing-math.js';

const IdParamSchema = z.object({ id: z.string().cuid() });

const LineItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  discountPercent: z.number().min(0).max(100).default(0),
  taxPercent: z.number().min(0).max(100).default(0),
});

const CreateInvoiceSchema = z.object({
  customerId: z.string().min(1),
  subscriptionId: z.string().cuid().optional(),
  number: z.string().min(1),
  amount: z.number().nonnegative(),
  currency: z.string().length(3).default('USD'),
  dueDate: z.string().datetime().optional(),
  lineItems: z.array(LineItemSchema).default([]),
  stripeInvoiceId: z.string().optional(),
});

export async function registerInvoicesRoutes(
  app: FastifyInstance,
  prisma: BillingPrisma
): Promise<void> {
  await app.register(
    async (r) => {
      // ─── LIST ────────────────────────────────────────────────────────────
      r.get(
        '/invoices',
        { preHandler: requirePermission(PERMISSIONS.INVOICES.READ) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const invoices = await prisma.invoice.findMany({
            where: { tenantId: jwt.tenantId, deletedAt: null },
            orderBy: { createdAt: 'desc' },
          });
          return reply.send({ success: true, data: invoices });
        }
      );

      // ─── CREATE ──────────────────────────────────────────────────────────
      r.post(
        '/invoices',
        { preHandler: requirePermission(PERMISSIONS.INVOICES.CREATE) },
        async (request, reply) => {
          const parsed = CreateInvoiceSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const invoice = await prisma.invoice.create({
            data: {
              ...parsed.data,
              tenantId: jwt.tenantId,
              dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : undefined,
              lineItems: parsed.data.lineItems,
            },
          });
          return reply.code(201).send({ success: true, data: invoice });
        }
      );

      // ─── GET BY ID ───────────────────────────────────────────────────────
      r.get(
        '/invoices/:id',
        { preHandler: requirePermission(PERMISSIONS.INVOICES.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const invoice = await prisma.invoice.findFirst({
            where: { id, tenantId: jwt.tenantId, deletedAt: null },
            include: { payments: true, creditNotes: true },
          });
          if (!invoice) throw new NotFoundError('Invoice not found');
          const balance = computeInvoiceBalance(invoice);
          return reply.send({ success: true, data: { ...invoice, balance } });
        }
      );

      // ─── FINALIZE (DRAFT → OPEN) ──────────────────────────────────────────
      r.post(
        '/invoices/:id/finalize',
        { preHandler: requirePermission(PERMISSIONS.INVOICES.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const existing = await prisma.invoice.findFirst({
            where: { id, tenantId: jwt.tenantId, deletedAt: null },
          });
          if (!existing) throw new NotFoundError('Invoice not found');
          if (existing.status !== 'DRAFT') {
            throw new BusinessRuleError('Only DRAFT invoices can be finalized');
          }
          const invoice = await prisma.invoice.update({
            where: { id },
            data: { status: 'OPEN' },
          });
          return reply.send({ success: true, data: invoice });
        }
      );

      // ─── VOID ────────────────────────────────────────────────────────────
      r.post(
        '/invoices/:id/void',
        { preHandler: requirePermission(PERMISSIONS.INVOICES.VOID) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const existing = await prisma.invoice.findFirst({
            where: { id, tenantId: jwt.tenantId, deletedAt: null },
          });
          if (!existing) throw new NotFoundError('Invoice not found');
          if (existing.status === 'VOID' || existing.status === 'PAID') {
            throw new BusinessRuleError(`Invoice cannot be voided from status ${existing.status}`);
          }
          const invoice = await prisma.invoice.update({
            where: { id },
            data: { status: 'VOID' },
          });
          return reply.send({ success: true, data: invoice });
        }
      );
    },
    { prefix: '/api/v1/billing' }
  );
}
