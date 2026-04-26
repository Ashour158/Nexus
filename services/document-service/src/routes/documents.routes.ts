import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { renderQuoteHtml, type QuoteData } from '../services/templates/quote.template.js';
import { renderContractHtml } from '../services/templates/contract.template.js';
import { htmlToPdf } from '../services/pdf.service.js';

const QuoteIdParams = z.object({ quoteId: z.string().cuid() });
const RenderSchema = z.object({
  template: z.enum(['quote', 'contract']),
  data: z.record(z.unknown()),
});

function authHeader(req: { headers: Record<string, string | string[] | undefined> }): Record<string, string> {
  const raw = req.headers.authorization;
  return typeof raw === 'string' ? { Authorization: raw } : {};
}

export async function registerDocumentsRoutes(app: FastifyInstance) {
  app.post('/api/v1/documents/quotes/:quoteId/pdf', async (request, reply) => {
    const { quoteId } = QuoteIdParams.parse(request.params);
    const financeBase = process.env.FINANCE_SERVICE_URL ?? 'http://localhost:3002';
    const res = await fetch(`${financeBase}/api/v1/quotes/${quoteId}`, {
      headers: authHeader(request as { headers: Record<string, string | string[] | undefined> }),
    });
    if (!res.ok) {
      return reply.code(404).send({ success: false, error: 'Quote not found' });
    }
    const quote = (await res.json()) as { data?: Record<string, unknown> };
    const q = (quote.data ?? {}) as Record<string, unknown>;
    const lineItemsRaw = Array.isArray(q.lineItems) ? q.lineItems : [];
    const lineItems = lineItemsRaw.map((x) => {
      const row = x as Record<string, unknown>;
      return {
        name: String(row.productName ?? row.name ?? 'Item'),
        description: typeof row.description === 'string' ? row.description : '',
        qty: Number(row.quantity ?? 1),
        unitPrice: String(row.unitPrice ?? '0'),
        discount: String(row.discountPercent ?? row.discount ?? '0'),
        total: String(row.total ?? '0'),
      };
    });
    const html = renderQuoteHtml({
      quoteNumber: String(q.quoteNumber ?? 'Q-NA'),
      name: String(q.name ?? 'Quote'),
      validUntil: q.validUntil ? String(q.validUntil) : undefined,
      currency: String(q.currency ?? 'USD'),
      subtotal: String(q.subtotal ?? '0'),
      discountAmount: String(q.discountAmount ?? q.discountTotal ?? '0'),
      taxAmount: String(q.taxAmount ?? q.taxTotal ?? '0'),
      total: String(q.total ?? '0'),
      terms: typeof q.terms === 'string' ? q.terms : undefined,
      notes: typeof q.notes === 'string' ? q.notes : undefined,
      lineItems,
    } satisfies QuoteData);
    const pdf = await htmlToPdf(html);
    reply
      .header('Content-Type', 'application/pdf')
      .header(
        'Content-Disposition',
        `attachment; filename="quote-${String(q.quoteNumber ?? 'NA')}.pdf"`
      );
    return reply.send(pdf);
  });

  app.post('/api/v1/documents/render', async (request, reply) => {
    const body = RenderSchema.parse(request.body);
    const html =
      body.template === 'quote'
        ? renderQuoteHtml(body.data as unknown as QuoteData)
        : renderContractHtml(body.data);
    const pdf = await htmlToPdf(html);
    reply.header('Content-Type', 'application/pdf');
    return reply.send(pdf);
  });
}
