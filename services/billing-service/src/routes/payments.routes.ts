import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission, NotFoundError, ValidationError } from '@nexus/service-utils';
import { NexusProducer, TOPICS } from '@nexus/kafka';
import type { BillingPrisma } from '../prisma.js';


const CreatePaymentSchema = z.object({
  invoiceId: z.string().cuid(),
  amount: z.number().positive(),
  currency: z.string().length(3).default('USD'),
  method: z.enum(['STRIPE', 'BANK_TRANSFER', 'CHEQUE', 'CASH', 'OTHER']).default('STRIPE'),
  status: z.enum(['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED']).default('PENDING'),
  stripePaymentIntentId: z.string().optional(),
  metadata: z.record(z.unknown()).default({}),
});

export async function registerPaymentsRoutes(
  app: FastifyInstance,
  prisma: BillingPrisma,
  producer: NexusProducer
): Promise<void> {
  await app.register(
    async (r) => {
      // ─── LIST ────────────────────────────────────────────────────────────
      r.get(
        '/payments',
        { preHandler: requirePermission(PERMISSIONS.INVOICES.READ) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const payments = await prisma.payment.findMany({
            where: { tenantId: jwt.tenantId },
            orderBy: { createdAt: 'desc' },
          });
          return reply.send({ success: true, data: payments });
        }
      );

      // ─── CREATE / RECORD PAYMENT ──────────────────────────────────────────
      r.post(
        '/payments',
        { preHandler: requirePermission(PERMISSIONS.INVOICES.UPDATE) },
        async (request, reply) => {
          const parsed = CreatePaymentSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;

          // Verify the invoice belongs to the tenant
          const invoice = await prisma.invoice.findFirst({
            where: { id: parsed.data.invoiceId, tenantId: jwt.tenantId, deletedAt: null },
          });
          if (!invoice) throw new NotFoundError('Invoice not found');

          const completedAt =
            parsed.data.status === 'COMPLETED' ? new Date() : undefined;
          const failedAt =
            parsed.data.status === 'FAILED' ? new Date() : undefined;

          const payment = await prisma.payment.create({
            data: {
              ...parsed.data,
              tenantId: jwt.tenantId,
              completedAt,
              failedAt,
            },
          });

          // When payment is COMPLETED, mark invoice PAID and publish event
          if (parsed.data.status === 'COMPLETED') {
            await prisma.invoice.update({
              where: { id: parsed.data.invoiceId },
              data: { status: 'PAID', paidAt: new Date() },
            });
            try {
              await producer.publish(TOPICS.PAYMENTS, {
                type: 'payment.received',
                tenantId: jwt.tenantId,
                invoiceId: parsed.data.invoiceId,
                amount: parsed.data.amount,
                currency: parsed.data.currency,
                paymentId: payment.id,
              });
            } catch (err) {
              app.log.warn({ err }, 'Failed to publish payment.received event');
            }
          }

          return reply.code(201).send({ success: true, data: payment });
        }
      );
    },
    { prefix: '/api/v1/billing' }
  );
}
