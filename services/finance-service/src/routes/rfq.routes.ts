import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@nexus/shared-types';
import type { FinancePrisma } from '../prisma.js';

const RFQSchema = z.object({
  title: z.string().min(1),
  accountId: z.string().cuid().optional(),
  contactId: z.string().cuid().optional(),
  currency: z.string().optional(),
  requiredByDate: z.coerce.date().optional(),
  lineItems: z.array(z.record(z.unknown())).optional(),
  internalNotes: z.string().optional(),
});

export async function registerRFQRoutes(
  app: FastifyInstance,
  prisma: FinancePrisma
): Promise<void> {
  await app.register(
    async (r) => {
      r.get('/rfqs', async (request, reply) => {
        const jwt = request.user as JwtPayload;
        const rows = await prisma.rFQ.findMany({
          where: { tenantId: jwt.tenantId },
          orderBy: { createdAt: 'desc' },
        });
        return reply.send({ success: true, data: rows });
      });

      r.post('/rfqs', async (request, reply) => {
        const jwt = request.user as JwtPayload;
        const parsed = RFQSchema.parse(request.body);
        const count = await prisma.rFQ.count({ where: { tenantId: jwt.tenantId } });
        const rfqNumber = `RFQ-${String(count + 1).padStart(6, '0')}`;
        const row = await prisma.rFQ.create({
          data: {
            tenantId: jwt.tenantId,
            rfqNumber,
            title: parsed.title,
            accountId: parsed.accountId,
            contactId: parsed.contactId,
            ownerId: jwt.sub,
            currency: parsed.currency ?? 'USD',
            requiredByDate: parsed.requiredByDate,
            lineItems: parsed.lineItems ?? [],
            internalNotes: parsed.internalNotes,
          },
        });
        return reply.code(201).send({ success: true, data: row });
      });

      r.get('/rfqs/:id', async (request, reply) => {
        const { id } = z.object({ id: z.string().cuid() }).parse(request.params);
        const row = await prisma.rFQ.findUnique({ where: { id } });
        if (!row) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Resource not found', requestId: request.id } });
        return reply.send({ success: true, data: row });
      });

      r.post('/rfqs/:id/send', async (request, reply) => {
        const { id } = z.object({ id: z.string().cuid() }).parse(request.params);
        const row = await prisma.rFQ.update({
          where: { id },
          data: { status: 'SENT' },
        });
        return reply.send({ success: true, data: row });
      });

      r.post('/rfqs/:id/convert', async (request, reply) => {
        const jwt = request.user as JwtPayload;
        const { id } = z.object({ id: z.string().cuid() }).parse(request.params);
        const rfq = await prisma.rFQ.findUnique({ where: { id } });
        if (!rfq) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Resource not found', requestId: request.id } });

        const quoteCount = await prisma.quote.count({ where: { tenantId: jwt.tenantId } });
        const quote = await prisma.quote.create({
          data: {
            tenantId: jwt.tenantId,
            dealId: rfq.accountId ?? 'rfq-conversion',
            accountId: rfq.accountId ?? 'rfq-conversion',
            ownerId: rfq.ownerId,
            quoteNumber: `Q-${String(quoteCount + 1).padStart(6, '0')}`,
            name: `Converted from ${rfq.rfqNumber}`,
            currency: rfq.currency,
            lineItems: (rfq.lineItems ?? []) as unknown as Record<string, unknown>[],
            rfqId: rfq.id,
            subtotal: 0,
            total: 0,
            discountAmount: 0,
            taxAmount: 0,
            pricingBreakdown: {},
            customFields: {},
            taxBreakdown: [],
          },
        });
        await prisma.rFQ.update({
          where: { id: rfq.id },
          data: { status: 'CONVERTED', convertedQuoteId: quote.id },
        });
        return reply.send({ success: true, data: { rfqId: rfq.id, quoteId: quote.id } });
      });
    },
    { prefix: '/api/v1' }
  );
}

