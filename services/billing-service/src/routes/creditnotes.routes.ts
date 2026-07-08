import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Decimal } from 'decimal.js';
import type { JwtPayload } from '@nexus/shared-types';
import {
  PERMISSIONS,
  requirePermission,
  requireEntitlement,
  NotFoundError,
  ValidationError,
  BusinessRuleError,
} from '@nexus/service-utils';
import { NexusProducer, TOPICS } from '@nexus/kafka';
import type { BillingPrisma } from '../prisma.js';
import { computeInvoiceBalance, money, toDecimal } from '../lib/billing-math.js';
import type { EntitlementResolver } from '@nexus/service-utils';

const IdParamSchema = z.object({ id: z.string().cuid() });

const IssueCreditNoteSchema = z.object({
  amount: z.number().positive(),
  reason: z.string().min(1),
  currency: z.string().length(3).optional(),
  metadata: z.record(z.unknown()).default({}),
});

/**
 * Credit-note / refund routes (COM-06). A credit note is issued against an
 * invoice with a reason + amount; it reduces the invoice's outstanding balance
 * (never the invoice amount) and emits `credit_note.issued`.
 *
 * Issuance demonstrates the entitlement guard (feature `credit_notes`).
 */
export async function registerCreditNotesRoutes(
  app: FastifyInstance,
  prisma: BillingPrisma,
  producer: NexusProducer,
  entitlementResolver: EntitlementResolver
): Promise<void> {
  await app.register(
    async (r) => {
      // ─── ISSUE CREDIT NOTE AGAINST AN INVOICE ────────────────────────────
      r.post(
        '/invoices/:id/credit-notes',
        {
          preHandler: [
            requirePermission(PERMISSIONS.BILLING.CREDIT),
            requireEntitlement('credit_notes', { resolve: entitlementResolver }),
          ],
        },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const parsed = IssueCreditNoteSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;

          const invoice = await prisma.invoice.findFirst({
            where: { id, tenantId: jwt.tenantId, deletedAt: null },
            include: { payments: true, creditNotes: true },
          });
          if (!invoice) throw new NotFoundError('Invoice not found');
          if (invoice.status === 'VOID') {
            throw new BusinessRuleError('Cannot issue a credit note against a VOID invoice');
          }

          // A credit note may not exceed the invoice's remaining outstanding +
          // already-credited amount (i.e. never credit more than the invoice).
          const alreadyCredited = invoice.creditNotes
            .filter((c) => c.status === 'ISSUED')
            .reduce((s, c) => s.plus(toDecimal(c.amount)), new Decimal(0));
          const creditable = toDecimal(invoice.amount).minus(alreadyCredited);
          const requested = money(parsed.data.amount);
          if (requested.greaterThan(creditable)) {
            throw new BusinessRuleError(
              `Credit amount ${requested.toFixed(2)} exceeds creditable balance ${money(creditable).toFixed(2)}`
            );
          }

          const count = await prisma.creditNote.count({ where: { tenantId: jwt.tenantId } });
          const number = `CN-${new Date().getFullYear()}-${String(count + 1).padStart(6, '0')}`;

          const creditNote = await prisma.creditNote.create({
            data: {
              tenantId: jwt.tenantId,
              invoiceId: invoice.id,
              customerId: invoice.customerId,
              number,
              amount: requested.toFixed(2),
              currency: parsed.data.currency ?? invoice.currency,
              reason: parsed.data.reason,
              metadata: parsed.data.metadata,
            },
          });

          // Recompute balance including the new credit; if fully covered, mark PAID.
          const balance = computeInvoiceBalance({
            amount: invoice.amount,
            payments: invoice.payments,
            creditNotes: [...invoice.creditNotes, creditNote],
          });
          if (new Decimal(balance.outstanding).lessThanOrEqualTo(0) && invoice.status !== 'PAID') {
            await prisma.invoice.update({
              where: { id: invoice.id },
              data: { status: 'PAID', paidAt: invoice.paidAt ?? new Date() },
            });
          }

          try {
            await producer.publish(TOPICS.INVOICES, {
              type: 'credit_note.issued',
              tenantId: jwt.tenantId,
              payload: {
                creditNoteId: creditNote.id,
                number: creditNote.number,
                invoiceId: invoice.id,
                invoiceNumber: invoice.number,
                customerId: invoice.customerId,
                amount: creditNote.amount.toString(),
                currency: creditNote.currency,
                reason: creditNote.reason,
                outstanding: balance.outstanding,
              },
            });
          } catch (err) {
            app.log.warn({ err }, 'Failed to publish credit_note.issued event');
          }

          return reply.code(201).send({ success: true, data: { creditNote, balance } });
        }
      );

      // ─── LIST CREDIT NOTES FOR AN INVOICE ────────────────────────────────
      r.get(
        '/invoices/:id/credit-notes',
        { preHandler: requirePermission(PERMISSIONS.BILLING.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const invoice = await prisma.invoice.findFirst({
            where: { id, tenantId: jwt.tenantId, deletedAt: null },
          });
          if (!invoice) throw new NotFoundError('Invoice not found');
          const creditNotes = await prisma.creditNote.findMany({
            where: { tenantId: jwt.tenantId, invoiceId: id },
            orderBy: { createdAt: 'desc' },
          });
          return reply.send({ success: true, data: creditNotes });
        }
      );
    },
    { prefix: '/api/v1/billing' }
  );
}
